/**
 * Distances for the yardage readout.
 *
 * Pure and tested, because a golfer picks a club off these numbers. Haversine
 * over a few hundred metres is accurate to well under a yard — the error that
 * matters is GPS fix quality, not the maths.
 */

export interface Point {
  lat: number;
  lng: number;
}

const EARTH_M = 6_371_000;
const METRES_PER_YARD = 0.9144;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function metresBetween(a: Point, b: Point): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(h));
}

/**
 * Yards, rounded to whole numbers.
 *
 * Golf is played in whole yards — a readout of "147.3" implies a precision the
 * GPS does not have and that nobody would use differently from 147.
 */
export function yardsBetween(a: Point, b: Point): number {
  return Math.round(metresBetween(a, b) / METRES_PER_YARD);
}

export interface GreenPoints {
  front?: Point | null;
  centre: Point;
  back?: Point | null;
}

export interface Yardages {
  front: number | null;
  centre: number;
  back: number | null;
}

/**
 * Front / centre / back from where you are standing.
 *
 * Front and back are null when the source did not supply them — a manually
 * dropped pin is one point, and inventing a front by guessing a green depth
 * would be a number a golfer might trust.
 */
export function yardagesTo(from: Point, green: GreenPoints): Yardages {
  return {
    front: green.front ? yardsBetween(from, green.front) : null,
    centre: yardsBetween(from, green.centre),
    back: green.back ? yardsBetween(from, green.back) : null,
  };
}

/**
 * Whether a fix is good enough to show a number.
 *
 * A phone that reports ±40m accuracy will happily produce a confident-looking
 * yardage that is two clubs wrong. Better to say "finding you" than to be
 * precisely incorrect.
 */
export const ACCURACY_LIMIT_M = 25;

export function fixIsUsable(accuracyMetres: number | null | undefined): boolean {
  return typeof accuracyMetres === 'number' && accuracyMetres <= ACCURACY_LIMIT_M;
}

/**
 * Bearing from one point to another, degrees clockwise from north.
 *
 * Needed to work out how much of the wind is in your face — a wind speed with
 * no direction relative to the shot is not usable information.
 */
export function bearingBetween(from: Point, to: Point): number {
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}
