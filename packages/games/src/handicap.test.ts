import { describe, expect, it } from 'vitest';
import { allocateStrokes, applyLowMan, courseHandicap, playingHandicap } from './handicap';
import { COURSE, FRONT_NINE, P1, P2, P3, player } from './fixtures/course';

describe('course handicap (WHS)', () => {
  it('uses index × slope / 113 + (rating − par), not the pre-2020 formula', () => {
    // 8.4 × 140 / 113 = 10.407, + (73.1 − 71) = 12.507 → 13
    expect(courseHandicap({ index: 8.4, slope: 140, rating: 73.1, par: 71 })).toBe(13);
    // The pre-2020 answer would have been 10 — a 3-shot difference.
    expect(Math.round((8.4 * 140) / 113)).toBe(10);
  });

  it('rounds half up', () => {
    // 0.5 exactly: rating − par carries the fraction.
    expect(courseHandicap({ index: 0, slope: 113, rating: 72.5, par: 72 })).toBe(1);
    expect(courseHandicap({ index: 0, slope: 113, rating: 71.5, par: 72 })).toBe(0);
  });

  it('halves for a nine-hole round', () => {
    expect(courseHandicap({ index: 8.4, slope: 140, rating: 73.1, par: 71, holeCount: 9 })).toBe(7);
  });

  it('handles a plus handicap', () => {
    // −1.2 × 128 / 113 = −1.359, + (70.6 − 71) = −1.759 → −2
    expect(courseHandicap({ index: -1.2, slope: 128, rating: 70.6, par: 71 })).toBe(-2);
  });

  it('adds the tee differential when players are off different tees', () => {
    const base = { index: 10, slope: 130, rating: 72.0, par: 72 };
    expect(courseHandicap(base)).toBe(12);
    // Playing a tee that rates 2.4 shots harder than the round's base tee.
    expect(courseHandicap({ ...base, teeDifferential: 2.4 })).toBe(14);
  });
});

describe('playing handicap', () => {
  it('applies the allowance and rounds once', () => {
    expect(playingHandicap(13, 100)).toBe(13);
    expect(playingHandicap(13, 90)).toBe(12); // 11.7 → 12
    expect(playingHandicap(13, 85)).toBe(11); // 11.05 → 11
    expect(playingHandicap(13, 75)).toBe(10); // 9.75 → 10
  });
});

describe('stroke allocation', () => {
  const strokesOn = (handicap: number, holeNumber: number) =>
    allocateStrokes(handicap, COURSE).get(holeNumber);

  it('gives a 9 handicap a shot on the nine lowest stroke indexes', () => {
    const map = allocateStrokes(9, COURSE);
    const stroked = [...map.entries()].filter(([, n]) => n > 0).map(([hole]) => hole);
    // Stroke indexes 1–9: holes 9, 14, 4, 12, 2, 13, 1, 10, 5.
    expect(stroked.sort((a, b) => a - b)).toEqual([1, 2, 4, 5, 9, 10, 12, 13, 14]);
    expect([...map.values()].reduce((a, b) => a + b, 0)).toBe(9);
  });

  it('gives a 20 handicap a shot everywhere plus a second on 1 and 2', () => {
    const map = allocateStrokes(20, COURSE);
    expect([...map.values()].reduce((a, b) => a + b, 0)).toBe(20);
    expect(strokesOn(20, 9)).toBe(2); // stroke index 1
    expect(strokesOn(20, 14)).toBe(2); // stroke index 2
    expect(strokesOn(20, 4)).toBe(1); // stroke index 3
  });

  it('makes a plus player give shots back, starting at the easiest hole', () => {
    const map = allocateStrokes(-2, COURSE);
    expect([...map.values()].reduce((a, b) => a + b, 0)).toBe(-2);
    expect(map.get(11)).toBe(-1); // stroke index 18
    expect(map.get(3)).toBe(-1); // stroke index 17
    expect(map.get(9)).toBe(0); // stroke index 1 is untouched
  });

  it('allocates across the nine actually played', () => {
    const map = allocateStrokes(4, FRONT_NINE);
    const stroked = [...map.entries()].filter(([, n]) => n > 0).map(([hole]) => hole);
    // Front-nine stroke indexes 1, 3, 5, 7 → holes 9, 4, 2, 1.
    expect(stroked.sort((a, b) => a - b)).toEqual([1, 2, 4, 9]);
  });

  it('gives nobody anything off scratch', () => {
    expect([...allocateStrokes(0, COURSE).values()].every((n) => n === 0)).toBe(true);
  });

  it('is total when there are no holes', () => {
    expect(allocateStrokes(10, []).size).toBe(0);
  });
});

describe('low-man adjustment', () => {
  it('drops everyone by the lowest handicap', () => {
    const adjusted = applyLowMan([player(P1, 4), player(P2, 14), player(P3, 22)], true);
    expect([...adjusted.values()]).toEqual([0, 10, 18]);
  });

  it('leaves handicaps alone when off', () => {
    const adjusted = applyLowMan([player(P1, 4), player(P2, 14)], false);
    expect([...adjusted.values()]).toEqual([4, 14]);
  });

  it('lifts a plus player to scratch and pushes everyone else up', () => {
    const adjusted = applyLowMan([player(P1, -2), player(P2, 8)], true);
    expect([...adjusted.values()]).toEqual([0, 10]);
  });

  it('is total with no players', () => {
    expect(applyLowMan([], true).size).toBe(0);
  });
});
