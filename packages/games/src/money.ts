/**
 * Integer cents only. Every helper here is total: no floats, no rounding
 * surprises, no way to leak a cent.
 */
import type { PlayerAmount } from './types';

/** Round half-up toward +infinity: 2.5 → 3, −2.5 → −2 (WHS convention). */
export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

/**
 * Split `totalCents` across recipients. Remainder cents go one each to the
 * lowest ids, so the result is exact and reproducible for audit.
 */
export function splitCents(totalCents: number, recipients: string[]): Map<string, number> {
  const out = new Map<string, number>();
  if (recipients.length === 0) return out;

  const ordered = [...recipients].sort();
  const sign = totalCents < 0 ? -1 : 1;
  const magnitude = Math.abs(totalCents);
  const base = Math.floor(magnitude / ordered.length);
  const remainder = magnitude - base * ordered.length;

  ordered.forEach((id, i) => {
    out.set(id, sign * (base + (i < remainder ? 1 : 0)));
  });
  return out;
}

/** Accumulator that keeps per-player cents and can only ever be balanced. */
export class Pot {
  private readonly amounts = new Map<string, number>();

  constructor(playerIds: string[]) {
    for (const id of playerIds) this.amounts.set(id, 0);
  }

  add(roundPlayerId: string, cents: number): void {
    this.amounts.set(roundPlayerId, (this.amounts.get(roundPlayerId) ?? 0) + cents);
  }

  /**
   * Move `perLoserCents` from each loser, split evenly across the winners.
   * Works for 1v1, 2v2 and lopsided sides alike, and always nets to zero.
   */
  transfer(losers: string[], winners: string[], perLoserCents: number): number {
    if (losers.length === 0 || winners.length === 0 || perLoserCents === 0) return 0;
    const total = perLoserCents * losers.length;
    for (const loser of losers) this.add(loser, -perLoserCents);
    for (const [winner, share] of splitCents(total, winners)) this.add(winner, share);
    return total;
  }

  /**
   * Every player on the losing side pays every player on the winning side.
   * This is the right shape when the sides are uneven — a lone wolf who beats
   * three players wins three units, and loses three when they don't.
   */
  pairwise(losers: string[], winners: string[], centsPerPair: number): number {
    if (centsPerPair === 0) return 0;
    for (const loser of losers) {
      for (const winner of winners) {
        this.add(loser, -centsPerPair);
        this.add(winner, centsPerPair);
      }
    }
    return centsPerPair * losers.length * winners.length;
  }

  get(roundPlayerId: string): number {
    return this.amounts.get(roundPlayerId) ?? 0;
  }

  /** Stable order: as constructed, so output is byte-identical across runs. */
  toPerPlayer(): PlayerAmount[] {
    return [...this.amounts].map(([roundPlayerId, amountCents]) => ({
      roundPlayerId,
      amountCents,
    }));
  }
}

export function sumCents(amounts: PlayerAmount[]): number {
  return amounts.reduce((total, a) => total + a.amountCents, 0);
}

/** Formats cents for breakdown text: 2000 → "$20", 1550 → "$15.50". */
export function formatCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = abs % 100;
  const body = rest === 0 ? `$${dollars}` : `$${dollars}.${String(rest).padStart(2, '0')}`;
  return negative ? `−${body}` : body;
}
