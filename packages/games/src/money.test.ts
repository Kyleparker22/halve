import { describe, expect, it } from 'vitest';
import { formatCents, Pot, roundHalfUp, splitCents, sumCents } from './money';

describe('roundHalfUp', () => {
  it('rounds .5 up, including through zero', () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(2.4999)).toBe(2);
    expect(roundHalfUp(-2.5)).toBe(-2);
    expect(roundHalfUp(-2.51)).toBe(-3);
    expect(roundHalfUp(0)).toBe(0);
  });
});

describe('splitCents', () => {
  it('is exact and deterministic', () => {
    const split = splitCents(1000, ['c', 'a', 'b']);
    expect([...split.entries()]).toEqual([
      ['a', 334],
      ['b', 333],
      ['c', 333],
    ]);
    expect([...split.values()].reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('gives the same answer every time, whatever order the ids arrive in', () => {
    const first = splitCents(101, ['x', 'y']);
    const second = splitCents(101, ['y', 'x']);
    expect([...first.entries()]).toEqual([...second.entries()]);
  });

  it('handles negatives without losing a cent', () => {
    const split = splitCents(-100, ['a', 'b', 'c']);
    expect([...split.values()].reduce((a, b) => a + b, 0)).toBe(-100);
    expect(split.get('a')).toBe(-34);
  });

  it('is empty with no recipients', () => {
    expect(splitCents(500, []).size).toBe(0);
  });
});

describe('Pot', () => {
  it('conserves money on a transfer', () => {
    const pot = new Pot(['a', 'b', 'c', 'd']);
    pot.transfer(['c', 'd'], ['a', 'b'], 1000);
    expect(sumCents(pot.toPerPlayer())).toBe(0);
    expect(pot.get('a')).toBe(1000);
    expect(pot.get('c')).toBe(-1000);
  });

  it('splits an uneven transfer to the cent', () => {
    const pot = new Pot(['a', 'b', 'c']);
    pot.transfer(['c'], ['a', 'b'], 101);
    expect(pot.get('a')).toBe(51);
    expect(pot.get('b')).toBe(50);
    expect(pot.get('c')).toBe(-101);
    expect(sumCents(pot.toPerPlayer())).toBe(0);
  });

  it('pays every winner from every loser in a pairwise settlement', () => {
    const pot = new Pot(['a', 'b', 'c', 'd']);
    pot.pairwise(['b', 'c', 'd'], ['a'], 200);
    expect(pot.get('a')).toBe(600);
    expect(pot.get('b')).toBe(-200);
    expect(sumCents(pot.toPerPlayer())).toBe(0);
  });

  it('does nothing when a side is empty or the stake is zero', () => {
    const pot = new Pot(['a', 'b']);
    expect(pot.transfer([], ['a'], 100)).toBe(0);
    expect(pot.transfer(['b'], [], 100)).toBe(0);
    expect(pot.transfer(['b'], ['a'], 0)).toBe(0);
    expect(pot.pairwise(['b'], ['a'], 0)).toBe(0);
    expect(sumCents(pot.toPerPlayer())).toBe(0);
  });

  it('keeps players in a stable order', () => {
    const pot = new Pot(['z', 'a', 'm']);
    expect(pot.toPerPlayer().map((p) => p.roundPlayerId)).toEqual(['z', 'a', 'm']);
  });
});

describe('formatCents', () => {
  it('drops the decimals on whole dollars', () => {
    expect(formatCents(2000)).toBe('$20');
    expect(formatCents(1550)).toBe('$15.50');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(-2000)).toBe('−$20');
    expect(formatCents(0)).toBe('$0');
  });
});
