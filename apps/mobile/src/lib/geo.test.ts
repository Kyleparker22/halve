import { describe, expect, it } from 'vitest';
import { fixIsUsable, metresBetween, yardagesTo, yardsBetween } from './geo';

describe('distance', () => {
  it('is zero at the same point', () => {
    const p = { lat: 28.0836, lng: -82.7637 };
    expect(metresBetween(p, p)).toBe(0);
  });

  /**
   * One minute of latitude is a nautical mile by definition — 1852m. If the
   * haversine is wrong, this is where it shows.
   */
  it('matches a known reference distance', () => {
    const metres = metresBetween({ lat: 0, lng: 0 }, { lat: 1 / 60, lng: 0 });
    expect(metres).toBeGreaterThan(1840);
    expect(metres).toBeLessThan(1860);
  });

  it('is symmetric', () => {
    const a = { lat: 28.0836, lng: -82.7637 };
    const b = { lat: 28.085, lng: -82.762 };
    expect(metresBetween(a, b)).toBeCloseTo(metresBetween(b, a), 6);
  });

  it('converts to whole yards', () => {
    // 0.9144m is exactly one yard.
    const a = { lat: 0, lng: 0 };
    const b = { lat: 0.0013715, lng: 0 }; // ~152.4m ≈ 166.7yd
    const yards = yardsBetween(a, b);
    expect(Number.isInteger(yards)).toBe(true);
    expect(yards).toBeGreaterThan(160);
    expect(yards).toBeLessThan(175);
  });
});

describe('yardages to the green', () => {
  // A green running away from the golfer: front nearest, back furthest.
  const me = { lat: 28.08, lng: -82.76 };
  const green = {
    front: { lat: 28.0812, lng: -82.76 },
    centre: { lat: 28.0815, lng: -82.76 },
    back: { lat: 28.0818, lng: -82.76 },
  };

  it('orders front, centre and back', () => {
    const y = yardagesTo(me, green);
    expect(y.front).not.toBeNull();
    expect(y.back).not.toBeNull();
    expect(y.front!).toBeLessThan(y.centre);
    expect(y.centre).toBeLessThan(y.back!);
  });

  /**
   * A manually dropped pin is one point. Inventing a front by assuming a green
   * depth would produce a number a golfer might club off — null is the honest
   * answer and the UI can say "centre only".
   */
  it('returns null for front and back when only a centre is known', () => {
    const y = yardagesTo(me, { centre: green.centre });
    expect(y.front).toBeNull();
    expect(y.back).toBeNull();
    expect(y.centre).toBeGreaterThan(0);
  });
});

describe('fix quality', () => {
  it('rejects a fix too vague to club off', () => {
    // ±40m is two clubs of error presented as a precise number.
    expect(fixIsUsable(40)).toBe(false);
    expect(fixIsUsable(8)).toBe(true);
  });

  it('rejects a missing accuracy reading rather than assuming it is fine', () => {
    expect(fixIsUsable(null)).toBe(false);
    expect(fixIsUsable(undefined)).toBe(false);
  });
});
