/**
 * @halve/ledger — game results and expenses become ledger entries, and open
 * entries become the smallest set of payments that closes them.
 *
 * Pure, like @halve/games: no I/O, no clock, no randomness. Every function here
 * is reproducible for audit, because three weeks later someone will ask why
 * they owe $35 and the answer has to be re-derivable.
 */

export interface PlayerAmount {
  roundPlayerId: string;
  amountCents: number;
}

/**
 * How a round player settles. A member resolves to themselves; a guest resolves
 * to the profile who vouched for them.
 */
export interface SettlingIdentity {
  roundPlayerId: string;
  profileId: string;
}

export interface LedgerEntryDraft {
  fromProfile: string;
  toProfile: string;
  amountCents: number;
}

export interface Payment {
  fromProfile: string;
  toProfile: string;
  amountCents: number;
}

export interface Position {
  profileId: string;
  /** Positive = owed money, negative = owes money. */
  netCents: number;
}

/** Aggregate signed per-player amounts into signed per-profile positions. */
export function resolvePositions(
  amounts: PlayerAmount[],
  identities: SettlingIdentity[],
): Position[] {
  const byPlayer = new Map(identities.map((i) => [i.roundPlayerId, i.profileId]));
  const totals = new Map<string, number>();

  for (const { roundPlayerId, amountCents } of amounts) {
    const profileId = byPlayer.get(roundPlayerId);
    if (!profileId) continue; // a player with no settling identity cannot be paid
    totals.set(profileId, (totals.get(profileId) ?? 0) + amountCents);
  }

  return [...totals.entries()]
    .map(([profileId, netCents]) => ({ profileId, netCents }))
    .filter((p) => p.netCents !== 0) // drop zeroes — §7.2 step 3
    .sort((a, b) => a.profileId.localeCompare(b.profileId));
}

/**
 * Split positions into debtors and creditors, sort each descending by absolute
 * amount with profile id as the tiebreak, and greedily match the largest debtor
 * against the largest creditor. Deterministic, minimal, reproducible.
 */
export function decomposePositions(positions: Position[]): LedgerEntryDraft[] {
  const order = (a: Position, b: Position) =>
    Math.abs(b.netCents) - Math.abs(a.netCents) || a.profileId.localeCompare(b.profileId);

  const debtors = positions.filter((p) => p.netCents < 0).sort(order).map((p) => ({ ...p }));
  const creditors = positions.filter((p) => p.netCents > 0).sort(order).map((p) => ({ ...p }));

  const drafts: LedgerEntryDraft[] = [];
  let d = 0;
  let c = 0;

  while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d]!;
    const creditor = creditors[c]!;
    const amount = Math.min(-debtor.netCents, creditor.netCents);

    if (amount > 0) {
      drafts.push({
        fromProfile: debtor.profileId,
        toProfile: creditor.profileId,
        amountCents: amount,
      });
      debtor.netCents += amount;
      creditor.netCents -= amount;
    }

    if (debtor.netCents === 0) d += 1;
    if (creditor.netCents === 0) c += 1;
  }

  return drafts;
}

/**
 * §7.2 end to end: game results → ledger entries.
 *
 * A guest and their voucher in the same game collapse into one net position,
 * which is what stops a naive per-player write from producing
 * from_profile = to_profile and violating the check constraint.
 */
export function gameResultsToLedger(
  amounts: PlayerAmount[],
  identities: SettlingIdentity[],
): LedgerEntryDraft[] {
  return decomposePositions(resolvePositions(amounts, identities));
}

/**
 * Debt simplification at settlement time. Same algorithm, applied to whatever is
 * currently open: a crew of eight with twenty open entries settles in the
 * fewest payments rather than twenty.
 */
export function simplifyDebts(entries: LedgerEntryDraft[]): Payment[] {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    totals.set(entry.fromProfile, (totals.get(entry.fromProfile) ?? 0) - entry.amountCents);
    totals.set(entry.toProfile, (totals.get(entry.toProfile) ?? 0) + entry.amountCents);
  }

  const positions = [...totals.entries()]
    .map(([profileId, netCents]) => ({ profileId, netCents }))
    .filter((p) => p.netCents !== 0)
    .sort((a, b) => a.profileId.localeCompare(b.profileId));

  return decomposePositions(positions).map((draft) => ({
    fromProfile: draft.fromProfile,
    toProfile: draft.toProfile,
    amountCents: draft.amountCents,
  }));
}

/** Net position per profile across a set of entries — the crew ledger screen. */
export function netPositions(entries: LedgerEntryDraft[]): Position[] {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    totals.set(entry.fromProfile, (totals.get(entry.fromProfile) ?? 0) - entry.amountCents);
    totals.set(entry.toProfile, (totals.get(entry.toProfile) ?? 0) + entry.amountCents);
  }
  return [...totals.entries()]
    .map(([profileId, netCents]) => ({ profileId, netCents }))
    .sort((a, b) => b.netCents - a.netCents || a.profileId.localeCompare(b.profileId));
}

/** Who owes whom, for the matrix view. Nets reciprocal pairs against each other. */
export function owesMatrix(entries: LedgerEntryDraft[]): LedgerEntryDraft[] {
  const pairs = new Map<string, number>();
  for (const entry of entries) {
    // Canonical direction: lower id first, sign carries the direction.
    const forward = entry.fromProfile < entry.toProfile;
    const key = forward
      ? `${entry.fromProfile}|${entry.toProfile}`
      : `${entry.toProfile}|${entry.fromProfile}`;
    const delta = forward ? entry.amountCents : -entry.amountCents;
    pairs.set(key, (pairs.get(key) ?? 0) + delta);
  }

  return [...pairs.entries()]
    .filter(([, amount]) => amount !== 0)
    .map(([key, amount]) => {
      const [a, b] = key.split('|') as [string, string];
      return amount > 0
        ? { fromProfile: a, toProfile: b, amountCents: amount }
        : { fromProfile: b, toProfile: a, amountCents: -amount };
    })
    .sort(
      (x, y) =>
        y.amountCents - x.amountCents ||
        x.fromProfile.localeCompare(y.fromProfile) ||
        x.toProfile.localeCompare(y.toProfile),
    );
}

export interface ExpenseShare {
  tripMemberId: string;
  amountCents: number;
}

/**
 * Even split that is cent-exact and deterministic: remainder cents go to the
 * first N members ordered by id, matching split_expense_evenly() in the database.
 */
export function splitEvenly(amountCents: number, tripMemberIds: string[]): ExpenseShare[] {
  if (tripMemberIds.length === 0) return [];
  const ordered = [...tripMemberIds].sort();
  const base = Math.floor(amountCents / ordered.length);
  const remainder = amountCents - base * ordered.length;
  return ordered.map((tripMemberId, i) => ({
    tripMemberId,
    amountCents: base + (i < remainder ? 1 : 0),
  }));
}

/**
 * Trip expenses → ledger drafts. The payer is owed their outlay minus their own
 * share; everyone else owes theirs.
 */
export function expenseToLedger(
  amountCents: number,
  paidByProfile: string,
  shares: Array<{ profileId: string; amountCents: number }>,
): LedgerEntryDraft[] {
  const positions = new Map<string, number>([[paidByProfile, amountCents]]);
  for (const share of shares) {
    positions.set(share.profileId, (positions.get(share.profileId) ?? 0) - share.amountCents);
  }
  return decomposePositions(
    [...positions.entries()]
      .map(([profileId, netCents]) => ({ profileId, netCents }))
      .filter((p) => p.netCents !== 0)
      .sort((a, b) => a.profileId.localeCompare(b.profileId)),
  );
}

export interface PaymentLinkInput {
  amountCents: number;
  note: string;
  /** Venmo handle without the @, or a phone/email Cash App tag. */
  handle?: string;
}

/** Prefilled payment deep links. Halve never holds funds — it only fills the form. */
export function venmoLink({ amountCents, note, handle }: PaymentLinkInput): string {
  const amount = (amountCents / 100).toFixed(2);
  const params = new URLSearchParams({
    txn: 'pay',
    amount,
    note,
  });
  if (handle) params.set('recipients', handle.replace(/^@/, ''));
  return `venmo://paycharge?${params.toString()}`;
}

export function cashAppLink({ amountCents, handle }: PaymentLinkInput): string {
  const amount = (amountCents / 100).toFixed(2);
  const tag = (handle ?? '').replace(/^\$/, '');
  return tag ? `https://cash.app/$${tag}/${amount}` : `https://cash.app/`;
}

export function formatCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const body = abs % 100 === 0 ? `$${abs / 100}` : `$${(abs / 100).toFixed(2)}`;
  return negative ? `−${body}` : body;
}
