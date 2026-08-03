/**
 * push-dispatch — drains the notification outbox to Expo Push.
 *
 * Run it on a schedule (pg_cron → pg_net, or an external scheduler). Two jobs:
 *   1. Flush expired debounce windows into one queued notification per round,
 *      so a crew of eight entering scores produces one push, not eight.
 *   2. Send everything queued and due, one row per device, pruning tokens Expo
 *      reports as dead.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface QueuedNotification {
  id: string;
  profile_id: string;
  kind: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  attempts: number;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/**
 * Most of these arrive in a pocket during a round. Only the ones a golfer would
 * be annoyed to miss are allowed to make a noise; scoring chatter must not, or
 * a four-hour round becomes four hours of buzzing and the whole crew turns
 * notifications off — which costs us every reminder too.
 */
const AUDIBLE = new Set([
  'round_invite',
  'rsvp_nudge',
  'round_starting',
  'seat_requested',
  'seat_approved',
  'settlement_requested',
  'settlement_confirmed',
]);

/** Expo rejects a whole message for a malformed token; never send one. */
const isExpoToken = (token: string) =>
  /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token) || /^[a-z\d]{8}-[a-z\d]{4}-/i.test(token);

/** Give up eventually — a row that cannot send must not be retried forever. */
const MAX_ATTEMPTS = 5;

/**
 * Constant-time compare. A timing oracle on a cron secret is a stretch, but the
 * check is three lines and the alternative is arguing about it later.
 */
function secretMatches(given: string | null, expected: string): boolean {
  if (!given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (request: Request) => {
  /**
   * Deployed with --no-verify-jwt, because the caller is pg_cron and not a
   * signed-in user. A dedicated shared secret guards it instead of the service
   * role key: this function needs permission to drain the outbox, not
   * permission to do anything at all to the database.
   */
  const expected = Deno.env.get('PUSH_DISPATCH_SECRET');
  if (!expected) {
    console.error('PUSH_DISPATCH_SECRET is not set; refusing to run');
    return new Response(JSON.stringify({ error: 'not configured' }), { status: 500 });
  }
  if (!secretMatches(request.headers.get('x-halve-cron'), expected)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // --- 1. collapse debounce windows ----------------------------------------
  const { data: batches } = await admin
    .from('notification_batches')
    .select('id, round_id, kind, event_count')
    .is('flushed_at', null)
    .lte('window_ends_at', new Date().toISOString());

  for (const batch of batches ?? []) {
    const { data: players } = await admin
      .from('round_players')
      .select('profile_id, rounds!inner(id, courses(name))')
      .eq('round_id', batch.round_id)
      .not('profile_id', 'is', null);

    const courseName =
      ((players ?? [])[0] as { rounds?: { courses?: { name?: string } } } | undefined)?.rounds
        ?.courses?.name ?? 'your round';

    for (const player of players ?? []) {
      await admin.rpc('enqueue_notification', {
        p_profile: player.profile_id,
        p_kind: batch.kind,
        p_title: 'Scores going in',
        p_body: `${batch.event_count} new ${
          batch.event_count === 1 ? 'score' : 'scores'
        } at ${courseName}`,
        p_data: { round_id: batch.round_id },
      });
    }

    await admin
      .from('notification_batches')
      .update({ flushed_at: new Date().toISOString() })
      .eq('id', batch.id);
  }

  // --- 2. send what is due --------------------------------------------------
  const { data: queued } = await admin
    .from('notification_queue')
    .select('id, profile_id, kind, title, body, data, attempts')
    .is('sent_at', null)
    .lte('send_after', new Date().toISOString())
    .lt('attempts', MAX_ATTEMPTS)
    .order('send_after', { ascending: true })
    .limit(200);

  const notifications = (queued ?? []) as QueuedNotification[];
  if (notifications.length === 0) {
    return new Response(JSON.stringify({ sent: 0, flushed: (batches ?? []).length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: devices } = await admin
    .from('devices')
    .select('profile_id, push_token')
    .in('profile_id', [...new Set(notifications.map((n) => n.profile_id))]);

  const tokensFor = new Map<string, string[]>();
  for (const device of devices ?? []) {
    if (!isExpoToken(device.push_token)) continue;
    const list = tokensFor.get(device.profile_id) ?? [];
    list.push(device.push_token);
    tokensFor.set(device.profile_id, list);
  }

  /**
   * A queue row is only finished once Expo has answered for it. The previous
   * version marked every fetched row sent regardless — so a single failed POST,
   * or an Expo outage, silently destroyed a batch of notifications with no
   * trace and no retry. Each message therefore carries its row id, and rows are
   * resolved from the tickets that come back.
   */
  const messages = notifications.flatMap((notification) =>
    (tokensFor.get(notification.profile_id) ?? []).map((to) => ({
      id: notification.id,
      message: {
        to,
        title: notification.title,
        body: notification.body,
        data: notification.data,
        sound: AUDIBLE.has(notification.kind) ? 'default' : null,
        // Expo drops low-priority pushes in the background on iOS.
        priority: AUDIBLE.has(notification.kind) ? 'high' : 'normal',
      },
    })),
  );

  // Nobody to send to — a profile that has never granted permission, or whose
  // only token was pruned. Nothing will ever change that for this row.
  const undeliverable = notifications
    .filter((n) => (tokensFor.get(n.profile_id) ?? []).length === 0)
    .map((n) => n.id);

  let sent = 0;
  const deadTokens: string[] = [];
  const delivered = new Set<string>();
  const failed = new Set<string>();

  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk.map((entry) => entry.message)),
      });
      if (!response.ok) {
        console.error('expo push rejected the batch', response.status, await response.text());
        chunk.forEach((entry) => failed.add(entry.id));
        continue;
      }

      const payload = (await response.json()) as { data?: ExpoTicket[] };
      const tickets = payload.data ?? [];
      chunk.forEach((entry, index) => {
        const ticket = tickets[index];
        if (!ticket) {
          failed.add(entry.id);
          return;
        }
        if (ticket.status === 'ok') {
          sent += 1;
          delivered.add(entry.id);
          return;
        }
        // A dead device is a permanent answer for this row, not a failure to
        // retry: re-sending to a token Expo has disowned never succeeds.
        if (ticket.details?.error === 'DeviceNotRegistered') {
          deadTokens.push(entry.message.to);
          delivered.add(entry.id);
          return;
        }
        console.error('expo ticket error', ticket.details?.error, ticket.message);
        failed.add(entry.id);
      });
    } catch (error) {
      console.error('expo push request failed', error);
      chunk.forEach((entry) => failed.add(entry.id));
    }
  }

  if (deadTokens.length > 0) {
    await admin.from('devices').delete().in('push_token', deadTokens);
  }

  // One device succeeding is enough to call the row done; the other device will
  // not be retried, which is the right trade against notifying twice.
  const done = [...new Set([...delivered, ...undeliverable])];
  if (done.length > 0) {
    await admin
      .from('notification_queue')
      .update({ sent_at: new Date().toISOString() })
      .in('id', done);
  }

  const retry = [...failed].filter((id) => !delivered.has(id));
  for (const id of retry) {
    const row = notifications.find((n) => n.id === id);
    await admin
      .from('notification_queue')
      .update({ attempts: (row?.attempts ?? 0) + 1 })
      .eq('id', id);
  }

  return new Response(
    JSON.stringify({
      sent,
      pruned: deadTokens.length,
      undeliverable: undeliverable.length,
      retrying: retry.length,
      flushed: (batches ?? []).length,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
