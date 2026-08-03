/**
 * "Plays like" — the distance to club off, rather than the distance on the GPS.
 *
 * These are the caddie heuristics golfers already use, not ballistics. They are
 * good enough to move a decision by a club, which is the whole point, and they
 * are wrong in the tails — a 40mph gale is not four times a 10mph breeze. The
 * UI says "plays like", never "will fly", and always shows which factors moved
 * the number so a golfer can disagree with it.
 *
 * Green speed is deliberately absent. Stimp is a putting variable; it has no
 * bearing on which iron you hit from 150, and a knob that visibly does nothing
 * is worse than no knob.
 */

export interface Conditions {
  /** Wind speed in mph. */
  windMph?: number | null;
  /** Direction the wind is blowing *from*, degrees clockwise from north. */
  windFromDeg?: number | null;
  /** Bearing from the golfer to the target, degrees clockwise from north. */
  shotBearingDeg?: number | null;
  /** Air temperature in Celsius. */
  tempC?: number | null;
  /** Height above sea level in metres. */
  altitudeM?: number | null;
  /** Green height minus golfer height, in metres. Positive is uphill. */
  elevationDeltaM?: number | null;
}

export interface Adjustment {
  label: string;
  yards: number;
}

export interface PlaysLike {
  actual: number;
  playsLike: number;
  adjustments: Adjustment[];
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * How much of the wind is in your face.
 *
 * Positive is headwind, negative is tail. A crosswind moves the ball sideways
 * rather than shortening it, so it contributes nothing here — pretending a
 * 20mph crosswind adds yardage is the kind of confident wrongness that makes
 * someone stop trusting the whole feature.
 */
export function headwindComponent(
  windMph: number,
  windFromDeg: number,
  shotBearingDeg: number,
): number {
  // Wind blowing *from* the direction you are hitting *towards* is a headwind.
  const angle = toRad(windFromDeg - shotBearingDeg);
  return windMph * Math.cos(angle);
}

export function playsLike(actualYards: number, conditions: Conditions): PlaysLike {
  const adjustments: Adjustment[] = [];

  // Wind. Roughly a yard per mph into the wind on a 150-yard shot, scaled by
  // distance; downwind helps about half as much as upwind hurts, which is the
  // asymmetry every golfer already knows and most calculators ignore.
  if (
    typeof conditions.windMph === 'number' &&
    typeof conditions.windFromDeg === 'number' &&
    typeof conditions.shotBearingDeg === 'number' &&
    conditions.windMph > 1
  ) {
    const head = headwindComponent(
      conditions.windMph,
      conditions.windFromDeg,
      conditions.shotBearingDeg,
    );
    const scale = actualYards / 150;
    const yards = Math.round((head > 0 ? head * 1.0 : head * 0.5) * scale);
    if (yards !== 0) {
      adjustments.push({
        label: `${Math.abs(Math.round(head))} mph ${head > 0 ? 'into' : 'behind'}`,
        yards,
      });
    }
  }

  // Elevation. About a yard per foot of rise — the single biggest factor after
  // wind, and the one people most often forget.
  if (typeof conditions.elevationDeltaM === 'number' && Math.abs(conditions.elevationDeltaM) > 1) {
    const feet = conditions.elevationDeltaM * 3.28084;
    const yards = Math.round(feet);
    if (yards !== 0) {
      adjustments.push({
        label: `${Math.abs(Math.round(feet))} ft ${feet > 0 ? 'uphill' : 'downhill'}`,
        yards,
      });
    }
  }

  // Altitude. Thinner air, about 2% further per 1000m — this is why a mountain
  // course eats a club.
  if (typeof conditions.altitudeM === 'number' && conditions.altitudeM > 200) {
    const yards = -Math.round(actualYards * 0.02 * (conditions.altitudeM / 1000));
    if (yards !== 0) {
      adjustments.push({ label: `${Math.round(conditions.altitudeM)}m elevation`, yards });
    }
  }

  // Temperature, relative to a mild 21°C. Small, but real on a cold morning.
  if (typeof conditions.tempC === 'number') {
    const delta = 21 - conditions.tempC;
    const yards = Math.round((delta / 5.6) * (actualYards / 150) * 2);
    if (yards !== 0) {
      adjustments.push({ label: `${Math.round(conditions.tempC)}°C`, yards });
    }
  }

  const total = adjustments.reduce((sum, a) => sum + a.yards, 0);
  return {
    actual: actualYards,
    // Never let adjustments produce a nonsense number.
    playsLike: Math.max(1, Math.round(actualYards + total)),
    adjustments,
  };
}

export interface Club {
  name: string;
  carryYards: number;
}

export interface Recommendation {
  club: Club;
  /** Positive means the club carries further than needed. */
  slackYards: number;
  /** The next longer and shorter clubs, for a golfer who disagrees. */
  alternatives: Club[];
}

/**
 * The club whose stock carry is nearest the playing distance.
 *
 * No cleverness about "taking one more" — that is a judgement about the golfer,
 * the lie and what is short of the green, and none of that is knowable here.
 * The number and the neighbours are shown so the decision stays theirs.
 */
export function recommendClub(clubs: Club[], playsLikeYards: number): Recommendation | null {
  if (clubs.length === 0) return null;
  const sorted = [...clubs].sort((a, b) => b.carryYards - a.carryYards);

  let best = sorted[0]!;
  let bestGap = Math.abs(best.carryYards - playsLikeYards);
  for (const club of sorted) {
    const gap = Math.abs(club.carryYards - playsLikeYards);
    // Ties go to the longer club, which is the order we are iterating.
    if (gap < bestGap) {
      bestGap = gap;
      best = club;
    }
  }

  const index = sorted.indexOf(best);
  const alternatives = [sorted[index - 1], sorted[index + 1]].filter(
    (c): c is Club => c !== undefined,
  );

  return { club: best, slackYards: best.carryYards - playsLikeYards, alternatives };
}
