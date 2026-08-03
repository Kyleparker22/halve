import { describe, expect, it } from 'vitest';
import { headwindComponent, playsLike, recommendClub } from './clubs';

describe('wind component', () => {
  it('is full strength dead into the wind', () => {
    // Hitting due north (0°), wind from the north.
    expect(headwindComponent(10, 0, 0)).toBeCloseTo(10, 5);
  });

  it('is negative downwind', () => {
    // Hitting north, wind from the south.
    expect(headwindComponent(10, 180, 0)).toBeCloseTo(-10, 5);
  });

  /**
   * The one that matters. A crosswind moves the ball sideways; it does not
   * shorten the shot. Treating 20mph across as extra yardage is exactly the
   * confident wrongness that makes a golfer stop trusting the feature.
   */
  it('is nothing across the wind', () => {
    expect(headwindComponent(20, 90, 0)).toBeCloseTo(0, 5);
    expect(headwindComponent(20, 270, 0)).toBeCloseTo(0, 5);
  });
});

describe('plays like', () => {
  it('is unchanged with no conditions known', () => {
    const result = playsLike(150, {});
    expect(result.playsLike).toBe(150);
    expect(result.adjustments).toHaveLength(0);
  });

  it('plays longer into the wind and shorter downwind', () => {
    const into = playsLike(150, { windMph: 10, windFromDeg: 0, shotBearingDeg: 0 });
    const down = playsLike(150, { windMph: 10, windFromDeg: 180, shotBearingDeg: 0 });
    expect(into.playsLike).toBeGreaterThan(150);
    expect(down.playsLike).toBeLessThan(150);
  });

  /** Downwind helps about half as much as upwind hurts — ask any golfer. */
  it('treats downwind as worth less than upwind', () => {
    const into = playsLike(150, { windMph: 10, windFromDeg: 0, shotBearingDeg: 0 });
    const down = playsLike(150, { windMph: 10, windFromDeg: 180, shotBearingDeg: 0 });
    expect(into.playsLike - 150).toBeGreaterThan(150 - down.playsLike);
  });

  it('plays longer uphill and shorter downhill', () => {
    expect(playsLike(150, { elevationDeltaM: 6 }).playsLike).toBeGreaterThan(150);
    expect(playsLike(150, { elevationDeltaM: -6 }).playsLike).toBeLessThan(150);
  });

  it('plays shorter at altitude', () => {
    expect(playsLike(150, { altitudeM: 1600 }).playsLike).toBeLessThan(150);
  });

  it('plays longer in the cold', () => {
    expect(playsLike(150, { tempC: 2 }).playsLike).toBeGreaterThan(150);
    expect(playsLike(150, { tempC: 32 }).playsLike).toBeLessThan(150);
  });

  it('names every factor that moved the number', () => {
    const result = playsLike(150, {
      windMph: 12,
      windFromDeg: 0,
      shotBearingDeg: 0,
      elevationDeltaM: 5,
      tempC: 5,
    });
    expect(result.adjustments.length).toBeGreaterThanOrEqual(3);
    for (const adjustment of result.adjustments) {
      expect(adjustment.label.length).toBeGreaterThan(0);
    }
    // The stated adjustments must actually account for the difference, or the
    // explanation is decoration rather than a reason.
    const sum = result.adjustments.reduce((total, a) => total + a.yards, 0);
    expect(result.playsLike).toBe(150 + sum);
  });

  it('never returns a nonsense distance', () => {
    // An absurd downhill should not produce zero or a negative yardage.
    expect(playsLike(20, { elevationDeltaM: -200 }).playsLike).toBeGreaterThan(0);
  });
});

describe('club recommendation', () => {
  const bag = [
    { name: 'PW', carryYards: 125 },
    { name: '9i', carryYards: 138 },
    { name: '8i', carryYards: 150 },
    { name: '7i', carryYards: 162 },
  ];

  it('picks the nearest stock carry', () => {
    expect(recommendClub(bag, 149)!.club.name).toBe('8i');
    expect(recommendClub(bag, 160)!.club.name).toBe('7i');
  });

  it('offers the clubs either side so the choice stays with the golfer', () => {
    const rec = recommendClub(bag, 150)!;
    expect(rec.alternatives.map((c) => c.name).sort()).toEqual(['7i', '9i']);
  });

  it('reports how much club is in hand', () => {
    const rec = recommendClub(bag, 145)!;
    expect(rec.club.name).toBe('8i');
    expect(rec.slackYards).toBe(5);
  });

  it('returns nothing for an empty bag rather than guessing', () => {
    expect(recommendClub([], 150)).toBeNull();
  });

  it('does not fall apart outside the bag', () => {
    expect(recommendClub(bag, 300)!.club.name).toBe('7i');
    expect(recommendClub(bag, 40)!.club.name).toBe('PW');
  });
});
