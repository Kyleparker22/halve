/**
 * @halve/games — public contract.
 *
 * Rules that hold for every game in this package:
 *   1. perPlayer amounts always sum to exactly zero. Money is conserved.
 *   2. Everything here is pure — no I/O, no clock, no randomness.
 *   3. Partial rounds are first-class: the money line must render after hole 4.
 *   4. A null score never produces NaN and never throws.
 *   5. Every breakdown line cites the hole(s) that produced it.
 */

export interface Score {
  roundPlayerId: string;
  hole: number;
  /** null = no score recorded (picked up, or the hole is not played yet). */
  strokes: number | null;
}

export interface Player {
  roundPlayerId: string;
  /** Strokes received for the round, before the low-man adjustment. */
  playingHandicap: number;
  /** Required for team games (match 2v2, best ball). */
  teamId?: string;
  /** Display name, used only to make breakdown lines readable. */
  name?: string;
}

export interface Hole {
  number: number;
  par: number;
  /** 1–18. Net games are unplayable without it. */
  strokeIndex: number;
}

export type HandicapMode = { mode: 'gross' } | { mode: 'net'; allowancePct: number };

/** Nassau presses. A press is a new match from the press hole to the end of its segment. */
export type PressRule =
  | { mode: 'none' }
  /** A side that goes `downBy` holes down is automatically pressed on the next hole. */
  | { mode: 'auto'; downBy: number }
  /** Presses the players called by hand, recorded on the scorecard. */
  | { mode: 'manual'; presses: ManualPress[] };

export interface ManualPress {
  /** First hole of the press. */
  hole: number;
  /** Which segment the press belongs to; inferred from the hole when omitted. */
  segment?: NassauSegment;
}

export type NassauSegment = 'front' | 'back' | 'total';

/** Teams for match / best ball. Either read off Player.teamId or given explicitly. */
export interface TeamSpec {
  [teamId: string]: string[]; // teamId -> roundPlayerIds
}

/** Stableford points by net score relative to par. Missing keys score 0. */
export interface PointTable {
  /** e.g. { '-3': 8, '-2': 5, '-1': 2, '0': 0, '1': -1, '2': -3 } for modified. */
  [netToPar: string]: number;
}

/** The wolf's choice on a hole. Recorded on the scorecard as the group plays. */
export interface WolfDecision {
  hole: number;
  /** Partner chosen by the wolf. Omitted when the wolf played alone. */
  partnerRoundPlayerId?: string;
  /** 'lone' = declined a partner after the tee shots; 'blind' = declared before them. */
  lone?: 'lone' | 'blind';
}

interface BaseConfig {
  stakeCents: number;
  handicap: HandicapMode;
  /**
   * Every player's handicap is reduced by the lowest player's, so the low man
   * plays off scratch. Near-universal club convention; see Technical Spec §5.1.
   * Defaults per game type in DEFAULT_LOW_MAN.
   */
  lowManAdjustment?: boolean;
}

export interface NassauConfig extends BaseConfig {
  type: 'nassau';
  presses: PressRule;
  teams?: TeamSpec;
}

export interface SkinsConfig extends BaseConfig {
  type: 'skins';
  /** Tied hole carries its skin forward. */
  carryover: boolean;
  /** A skin only counts if the winner is at or under par on the hole. */
  validation: boolean;
}

export interface MatchConfig extends BaseConfig {
  type: 'match';
  teams?: TeamSpec;
}

export interface StrokeConfig extends BaseConfig {
  type: 'stroke';
}

export interface BestBallConfig extends BaseConfig {
  type: 'bestball';
  teams?: TeamSpec;
}

export interface WolfConfig extends BaseConfig {
  type: 'wolf';
  loneMultiplier: number;
  blindMultiplier: number;
  /** Wolf order. Defaults to the order players are passed in. */
  order?: string[];
  decisions: WolfDecision[];
}

export interface StablefordConfig extends BaseConfig {
  type: 'stableford';
  table?: PointTable;
}

export type GameConfig =
  | NassauConfig
  | SkinsConfig
  | MatchConfig
  | StrokeConfig
  | BestBallConfig
  | WolfConfig
  | StablefordConfig;

export type GameType = GameConfig['type'];

export interface BreakdownLine {
  /** The hole(s) that produced this line. Never empty. */
  holes: number[];
  /** Human-readable and arguable: "Hole 7 — Todd birdied. 3 skins @ $5 = $15." */
  text: string;
  /** Players this line concerns — used to partition the narrative per player. */
  players: string[];
  /** Money this line moved, in cents, positive. Absent for informational lines. */
  amountCents?: number;
  /** 'front' | 'back' | 'total' | 'press 1' | ... */
  segment?: string;
}

export interface PlayerAmount {
  roundPlayerId: string;
  amountCents: number;
}

export interface GameResult {
  /** MUST sum to exactly 0. */
  perPlayer: PlayerAmount[];
  breakdown: BreakdownLine[];
  /** false while any participant is missing a score on any hole of the round. */
  isComplete: boolean;
}

/**
 * Low-man adjustment defaults (Technical Spec §5.1). The spec names match, best
 * ball, skins and nassau as on, and stroke and stableford as off. Wolf is not
 * named; it is a hole-by-hole match format, so it follows the match convention.
 */
export const DEFAULT_LOW_MAN: Record<GameType, boolean> = {
  nassau: true,
  skins: true,
  match: true,
  bestball: true,
  wolf: true,
  stroke: false,
  stableford: false,
};

export const STANDARD_STABLEFORD: PointTable = {
  '-4': 6,
  '-3': 5,
  '-2': 4,
  '-1': 3,
  '0': 2,
  '1': 1,
  '2': 0,
};

export const MODIFIED_STABLEFORD: PointTable = {
  '-3': 8,
  '-2': 5,
  '-1': 2,
  '0': 0,
  '1': -1,
  '2': -3,
};
