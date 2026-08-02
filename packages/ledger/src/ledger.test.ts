import { describe, expect, it } from 'vitest';
import {
  cashAppLink,
  decomposePositions,
  expenseToLedger,
  formatCents,
  gameResultsToLedger,
  netPositions,
  owesMatrix,
  resolvePositions,
  simplifyDebts,
  splitEvenly,
  venmoLink,
  type LedgerEntryDraft,
  type PlayerAmount,
  type SettlingIdentity,
} from './index';

const KYLE = 'profile-kyle';
const TODD = 'profile-todd';
const MARCUS = 'profile-marcus';
const DANA = 'profile-dana';

const conserved = (entries: LedgerEntryDraft[]) =>
  entries.reduce((sum, e) => sum + e.amountCents, 0);

describe('resolvePositions', () => {
  const identities: SettlingIdentity[] = [
    { roundPlayerId: 'rp-kyle', profileId: KYLE },
    { roundPlayerId: 'rp-todd', profileId: TODD },
    { roundPlayerId: 'rp-guest', profileId: KYLE }, // Big Dave, vouched by Kyle
  ];

  it('resolves a guest to their voucher and nets them together', () => {
    const amounts: PlayerAmount[] = [
      { roundPlayerId: 'rp-kyle', amountCents: -1500 },
      { roundPlayerId: 'rp-todd', amountCents: 500 },
      { roundPlayerId: 'rp-guest', amountCents: 1000 },
    ];
    expect(resolvePositions(amounts, identities)).toEqual([
      { profileId: KYLE, netCents: -500 },
      { profileId: TODD, netCents: 500 },
    ]);
  });

  it('drops profiles that net to zero', () => {
    const amounts: PlayerAmount[] = [
      { roundPlayerId: 'rp-kyle', amountCents: -1000 },
      { roundPlayerId: 'rp-guest', amountCents: 1000 },
      { roundPlayerId: 'rp-todd', amountCents: 0 },
    ];
    expect(resolvePositions(amounts, identities)).toEqual([]);
  });

  it('ignores a player with no settling identity rather than inventing one', () => {
    const amounts: PlayerAmount[] = [
      { roundPlayerId: 'rp-kyle', amountCents: -500 },
      { roundPlayerId: 'rp-unknown', amountCents: 500 },
    ];
    expect(resolvePositions(amounts, identities)).toEqual([{ profileId: KYLE, netCents: -500 }]);
  });
});

describe('gameResultsToLedger', () => {
  const identities: SettlingIdentity[] = [
    { roundPlayerId: 'rp-kyle', profileId: KYLE },
    { roundPlayerId: 'rp-todd', profileId: TODD },
    { roundPlayerId: 'rp-marcus', profileId: MARCUS },
    { roundPlayerId: 'rp-guest', profileId: KYLE },
  ];

  it('writes no entries when a guest only loses to their own voucher', () => {
    // The single most common guest scenario, and the one that used to produce
    // from_profile = to_profile and a constraint violation.
    const entries = gameResultsToLedger(
      [
        { roundPlayerId: 'rp-kyle', amountCents: 2000 },
        { roundPlayerId: 'rp-guest', amountCents: -2000 },
      ],
      identities,
    );
    expect(entries).toEqual([]);
  });

  it('never writes a self-entry', () => {
    const entries = gameResultsToLedger(
      [
        { roundPlayerId: 'rp-kyle', amountCents: 1500 },
        { roundPlayerId: 'rp-guest', amountCents: -500 },
        { roundPlayerId: 'rp-todd', amountCents: -1000 },
      ],
      identities,
    );
    for (const entry of entries) expect(entry.fromProfile).not.toBe(entry.toProfile);
    expect(entries).toEqual([{ fromProfile: TODD, toProfile: KYLE, amountCents: 1000 }]);
  });

  it('matches the largest debtor against the largest creditor', () => {
    const entries = gameResultsToLedger(
      [
        { roundPlayerId: 'rp-kyle', amountCents: 5000 },
        { roundPlayerId: 'rp-todd', amountCents: 1000 },
        { roundPlayerId: 'rp-marcus', amountCents: -6000 },
      ],
      identities,
    );
    expect(entries).toEqual([
      { fromProfile: MARCUS, toProfile: KYLE, amountCents: 5000 },
      { fromProfile: MARCUS, toProfile: TODD, amountCents: 1000 },
    ]);
  });

  it('conserves money and balances both sides', () => {
    const amounts: PlayerAmount[] = [
      { roundPlayerId: 'rp-kyle', amountCents: 3300 },
      { roundPlayerId: 'rp-todd', amountCents: -1100 },
      { roundPlayerId: 'rp-marcus', amountCents: -1100 },
      { roundPlayerId: 'rp-guest', amountCents: -1100 },
    ];
    const entries = gameResultsToLedger(amounts, identities);
    // Kyle's guest loses to Kyle, so Kyle's real position is 3300 − 1100 = 2200.
    expect(conserved(entries)).toBe(2200);
    expect(netPositions(entries)).toEqual([
      { profileId: KYLE, netCents: 2200 },
      { profileId: MARCUS, netCents: -1100 },
      { profileId: TODD, netCents: -1100 },
    ]);
  });

  it('is byte-identical across runs and input orderings', () => {
    const amounts: PlayerAmount[] = [
      { roundPlayerId: 'rp-marcus', amountCents: -2500 },
      { roundPlayerId: 'rp-kyle', amountCents: 1500 },
      { roundPlayerId: 'rp-todd', amountCents: 1000 },
    ];
    const first = JSON.stringify(gameResultsToLedger(amounts, identities));
    const shuffled = JSON.stringify(gameResultsToLedger([...amounts].reverse(), identities));
    expect(shuffled).toBe(first);
  });
});

describe('decomposePositions', () => {
  it('produces at most n − 1 entries', () => {
    const positions = [
      { profileId: 'a', netCents: -1000 },
      { profileId: 'b', netCents: -500 },
      { profileId: 'c', netCents: 700 },
      { profileId: 'd', netCents: 800 },
    ];
    const entries = decomposePositions(positions);
    expect(entries.length).toBeLessThanOrEqual(positions.length - 1);
    expect(netPositions(entries).map((p) => p.netCents).sort((x, y) => x - y)).toEqual(
      [...positions].map((p) => p.netCents).sort((x, y) => x - y),
    );
  });

  it('breaks ties on profile id, not on input order', () => {
    const entries = decomposePositions([
      { profileId: 'zeta', netCents: 1000 },
      { profileId: 'alpha', netCents: 1000 },
      { profileId: 'mike', netCents: -2000 },
    ]);
    expect(entries[0]!.toProfile).toBe('alpha');
  });

  it('returns nothing for a balanced-to-zero set', () => {
    expect(decomposePositions([])).toEqual([]);
    expect(decomposePositions([{ profileId: 'a', netCents: 0 }])).toEqual([]);
  });
});

describe('simplifyDebts', () => {
  it('collapses A→B→C into one payment', () => {
    const payments = simplifyDebts([
      { fromProfile: 'a', toProfile: 'b', amountCents: 1000 },
      { fromProfile: 'b', toProfile: 'c', amountCents: 1000 },
    ]);
    expect(payments).toEqual([{ fromProfile: 'a', toProfile: 'c', amountCents: 1000 }]);
  });

  it('settles a crew of eight with twenty entries in at most seven payments', () => {
    const members = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'];
    const entries: LedgerEntryDraft[] = [];
    for (let i = 0; i < 20; i += 1) {
      const from = members[i % 8]!;
      const to = members[(i * 3 + 1) % 8]!;
      if (from === to) continue;
      entries.push({ fromProfile: from, toProfile: to, amountCents: 500 + i * 137 });
    }
    const payments = simplifyDebts(entries);
    expect(payments.length).toBeLessThanOrEqual(7);

    // Everyone ends up exactly where the raw entries put them.
    const before = new Map(netPositions(entries).map((p) => [p.profileId, p.netCents]));
    const after = new Map(netPositions(payments).map((p) => [p.profileId, p.netCents]));
    expect(after).toEqual(before);
  });

  it('cancels out a mutual debt entirely', () => {
    expect(
      simplifyDebts([
        { fromProfile: 'a', toProfile: 'b', amountCents: 1500 },
        { fromProfile: 'b', toProfile: 'a', amountCents: 1500 },
      ]),
    ).toEqual([]);
  });
});

describe('owesMatrix', () => {
  it('nets reciprocal pairs into one direction', () => {
    expect(
      owesMatrix([
        { fromProfile: KYLE, toProfile: TODD, amountCents: 2000 },
        { fromProfile: TODD, toProfile: KYLE, amountCents: 500 },
        { fromProfile: MARCUS, toProfile: KYLE, amountCents: 800 },
      ]),
    ).toEqual([
      { fromProfile: KYLE, toProfile: TODD, amountCents: 1500 },
      { fromProfile: MARCUS, toProfile: KYLE, amountCents: 800 },
    ]);
  });

  it('drops pairs that cancel', () => {
    expect(
      owesMatrix([
        { fromProfile: KYLE, toProfile: TODD, amountCents: 2000 },
        { fromProfile: TODD, toProfile: KYLE, amountCents: 2000 },
      ]),
    ).toEqual([]);
  });
});

describe('trip expenses', () => {
  it('splits evenly to the cent, remainder to the lowest ids', () => {
    const shares = splitEvenly(10000, ['tm-3', 'tm-1', 'tm-2']);
    expect(shares).toEqual([
      { tripMemberId: 'tm-1', amountCents: 3334 },
      { tripMemberId: 'tm-2', amountCents: 3333 },
      { tripMemberId: 'tm-3', amountCents: 3333 },
    ]);
    expect(shares.reduce((s, x) => s + x.amountCents, 0)).toBe(10000);
  });

  it('is empty with nobody to split across', () => {
    expect(splitEvenly(1000, [])).toEqual([]);
  });

  it('turns an expense into entries owed to whoever fronted it', () => {
    const entries = expenseToLedger(84000, KYLE, [
      { profileId: KYLE, amountCents: 21000 },
      { profileId: TODD, amountCents: 21000 },
      { profileId: MARCUS, amountCents: 21000 },
      { profileId: DANA, amountCents: 21000 },
    ]);
    expect(netPositions(entries)).toEqual([
      { profileId: KYLE, netCents: 63000 },
      { profileId: DANA, netCents: -21000 },
      { profileId: MARCUS, netCents: -21000 },
      { profileId: TODD, netCents: -21000 },
    ]);
    expect(conserved(entries)).toBe(63000);
  });

  it('writes nothing when the payer covered only themselves', () => {
    expect(expenseToLedger(5000, KYLE, [{ profileId: KYLE, amountCents: 5000 }])).toEqual([]);
  });
});

describe('payment links', () => {
  it('prefills Venmo with amount, recipient and note', () => {
    const link = venmoLink({ amountCents: 3550, note: 'Saturday at Copperhead', handle: '@todd' });
    expect(link).toContain('venmo://paycharge?');
    expect(link).toContain('txn=pay');
    expect(link).toContain('amount=35.50');
    expect(link).toContain('recipients=todd');
    expect(link).toContain('note=Saturday+at+Copperhead');
  });

  it('still produces a link with no handle on file', () => {
    expect(venmoLink({ amountCents: 100, note: 'x' })).not.toContain('recipients');
  });

  it('builds a Cash App link', () => {
    expect(cashAppLink({ amountCents: 2000, note: 'x', handle: '$todd' })).toBe(
      'https://cash.app/$todd/20.00',
    );
    expect(cashAppLink({ amountCents: 2000, note: 'x' })).toBe('https://cash.app/');
  });
});

describe('formatCents', () => {
  it('reads like money', () => {
    expect(formatCents(2000)).toBe('$20');
    expect(formatCents(-3550)).toBe('−$35.50');
    expect(formatCents(0)).toBe('$0');
  });
});

describe('property: money is conserved', () => {
  // Deterministic pseudo-random walk — no Math.random, so a failure is reproducible.
  const lcg = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;

  it('holds across 500 generated result sets', () => {
    const next = lcg(42);
    const profiles = [KYLE, TODD, MARCUS, DANA];

    for (let run = 0; run < 500; run += 1) {
      const amounts: PlayerAmount[] = [];
      let running = 0;
      for (let i = 0; i < profiles.length - 1; i += 1) {
        const value = Math.floor(next() * 20000) - 10000;
        running += value;
        amounts.push({ roundPlayerId: `rp-${i}`, amountCents: value });
      }
      amounts.push({ roundPlayerId: `rp-${profiles.length - 1}`, amountCents: -running });

      const identities = profiles.map((profileId, i) => ({
        roundPlayerId: `rp-${i}`,
        profileId,
      }));

      const entries = gameResultsToLedger(amounts, identities);
      for (const entry of entries) {
        expect(entry.amountCents).toBeGreaterThan(0);
        expect(entry.fromProfile).not.toBe(entry.toProfile);
      }

      // Every profile ends on exactly the position the game gave them.
      const expected = new Map(
        amounts
          .map((a, i) => [profiles[i]!, a.amountCents] as const)
          .filter(([, cents]) => cents !== 0),
      );
      const actual = new Map(netPositions(entries).map((p) => [p.profileId, p.netCents]));
      for (const [profileId, cents] of expected) {
        expect(actual.get(profileId) ?? 0).toBe(cents);
      }

      // And simplification does not move anyone.
      const simplified = simplifyDebts(entries);
      expect(new Map(netPositions(simplified).map((p) => [p.profileId, p.netCents]))).toEqual(
        actual,
      );
    }
  });
});
