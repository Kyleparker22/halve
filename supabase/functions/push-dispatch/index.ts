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
  title: string;
  body: string;
  data: Record<string, unknown>;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  details?: { error?: string };
}

Deno.serve(async () => {
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
    .select('id, profile_id, title, body, data')
    .is('sent_at', null)
    .lte('send_after', new Date().toISOString())
    .limit(200);

  const notifications = (queued ?? []) as QueuedNotification[];
  if (notifications.length === 0) return new Response(JSON.stringify({ sent: 0 }));

  const { data: devices } = await admin
    .from('devices')
    .select('profile_id, push_token')
    .in('profile_id', [...new Set(notifications.map((n) => n.profile_id))]);

  const tokensFor = new Map<string, string[]>();
  for (const device of devices ?? []) {
    const list = tokensFor.get(device.profile_id) ?? [];
    list.push(device.push_token);
    tokensFor.set(device.profile_id, list);
  }

  const messages = notifications.flatMap((notification) =>
    (tokensFor.get(notification.profile_id) ?? []).map((to) => ({
      to,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      sound: null,
    })),
  );

  let sent = 0;
  const deadTokens: string[] = [];

  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk),
    });
    if (!response.ok) continue;

    const payload = (await response.json()) as { data?: ExpoTicket[] };
    (payload.data ?? []).forEach((ticket, index) => {
      if (ticket.status === 'ok') {
        sent += 1;
        return;
      }
      if (ticket.details?.error === 'DeviceNotRegistered') {
        deadTokens.push(chunk[index]!.to);
      }
    });
  }

  if (deadTokens.length > 0) {
    await admin.from('devices').delete().in('push_token', deadTokens);
  }

  await admin
    .from('notification_queue')
    .update({ sent_at: new Date().toISOString() })
    .in(
      'id',
      notifications.map((n) => n.id),
    );

  return new Response(JSON.stringify({ sent, pruned: deadTokens.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
