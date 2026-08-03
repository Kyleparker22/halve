/**
 * post-trip-expenses — turns logged expenses into ledger entries.
 *
 * Without this a trip could record who paid for what and then never settle:
 * `trip_expense` is a ledger source that nothing wrote. M6's acceptance
 * criterion — a 4-day, 8-person trip settling into ≤7 payments — was
 * unreachable, because the entries the settlement batch simplifies did not
 * exist.
 *
 * One entry set per expense rather than one for the trip, deliberately. Netting
 * already happens at settlement time via simplifyDebts, and a single netted
 * blob would leave "you owe Dana $214" with nothing behind it. Per-expense
 * entries mean every number on the settle screen can be traced back to a dinner.
 *
 * Idempotent: an expense that already has entries is skipped, so this is safe
 * to call after every add and again before settling.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { expenseToLedger } from '../_shared/ledger/index.ts';

interface Body {
  trip_id: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return json({ error: 'missing authorization' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const { trip_id: tripId } = (await request.json()) as Body;
  if (!tripId) return json({ error: 'trip_id required' }, 400);

  // The caller must be able to see the trip. RLS on trip_members answers that
  // for us — asking as the user is the check.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: visible } = await caller.from('trips').select('id').eq('id', tripId).maybeSingle();
  if (!visible) return json({ error: 'not found' }, 404);

  const admin = createClient(url, serviceKey);

  const { data: trip, error: tripError } = await admin
    .from('trips')
    .select('id, crew_id')
    .eq('id', tripId)
    .single();
  if (tripError || !trip) return json({ error: 'trip not found' }, 404);

  /**
   * A trip member is a guest or a profile. Guests have no account, so their
   * money resolves to the person who vouched for them — otherwise a guest's
   * share is simply lost, and the expense stops summing to zero.
   */
  const { data: members } = await admin
    .from('trip_members')
    .select('id, profile_id, crew_guests(vouched_by)')
    .eq('trip_id', tripId);

  const settlesTo = new Map<string, string>();
  for (const member of (members ?? []) as Array<{
    id: string;
    profile_id: string | null;
    crew_guests: { vouched_by: string } | null;
  }>) {
    const profileId = member.profile_id ?? member.crew_guests?.vouched_by ?? null;
    if (profileId) settlesTo.set(member.id, profileId);
  }

  const { data: expenses } = await admin
    .from('trip_expenses')
    .select('id, amount_cents, description, paid_by, trip_expense_shares(trip_member_id, amount_cents)')
    .eq('trip_id', tripId);

  // Which expenses already reached the ledger. Entries are immutable, so this
  // is the whole of the idempotency check.
  const { data: posted } = await admin
    .from('ledger_entries')
    .select('source_id')
    .eq('trip_id', tripId)
    .eq('source_type', 'trip_expense');
  const alreadyPosted = new Set((posted ?? []).map((row) => row.source_id));

  let written = 0;
  let skipped = 0;
  const unsettleable: string[] = [];

  for (const expense of (expenses ?? []) as Array<{
    id: string;
    amount_cents: number;
    description: string | null;
    paid_by: string;
    trip_expense_shares: Array<{ trip_member_id: string; amount_cents: number }>;
  }>) {
    if (alreadyPosted.has(expense.id)) {
      skipped += 1;
      continue;
    }

    const payerProfile = settlesTo.get(expense.paid_by);
    if (!payerProfile) {
      // A guest with no voucher cannot be paid back. Surface it rather than
      // silently dropping the expense from the trip's money.
      unsettleable.push(expense.id);
      continue;
    }

    const shares = expense.trip_expense_shares
      .map((share) => ({
        profileId: settlesTo.get(share.trip_member_id),
        amountCents: share.amount_cents,
      }))
      .filter((share): share is { profileId: string; amountCents: number } =>
        Boolean(share.profileId),
      );

    if (shares.length === 0) continue;

    const drafts = expenseToLedger(expense.amount_cents, payerProfile, shares);
    if (drafts.length === 0) {
      // The payer covered only their own share. Nothing is owed; not an error.
      skipped += 1;
      continue;
    }

    const { error } = await admin.from('ledger_entries').insert(
      drafts.map((draft) => ({
        crew_id: trip.crew_id,
        trip_id: tripId,
        from_profile: draft.fromProfile,
        to_profile: draft.toProfile,
        amount_cents: draft.amountCents,
        source_type: 'trip_expense',
        source_id: expense.id,
        note: expense.description,
        status: 'open',
      })),
    );
    if (error) return json({ error: error.message, expense_id: expense.id }, 500);
    written += drafts.length;
  }

  return json({ written, skipped, unsettleable });
});
