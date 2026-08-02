/**
 * Domain types shared between the app and the edge functions. Database row
 * types live in ./database (regenerate with `pnpm gen:types`).
 */
export type { Database, Json } from './database';
export * from './database';

import type { GameConfig } from '@halve/games';
import type { GameRow, RoundPlayerRow, RoundRow, ScoreRow } from './database';

/** A round player with the display data the UI needs, guest or member. */
export interface RosterEntry {
  id: string;
  roundId: string;
  profileId: string | null;
  guestId: string | null;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  isGuest: boolean;
  /** For a guest, the profile their money resolves to. */
  settlesToProfileId: string | null;
  rsvp: RoundPlayerRow['rsvp'];
  playingHandicap: number | null;
  teeId: string | null;
  position: number | null;
}

/** Everything the scorecard needs, prefetched when the round is opened. */
export interface RoundBundle {
  round: RoundRow;
  courseName: string;
  teeName: string | null;
  holes: Array<{ number: number; par: number; strokeIndex: number; yardage: number | null }>;
  roster: RosterEntry[];
  /** config is parsed into the engine's discriminated union, not raw Json. */
  games: Array<Omit<GameRow, 'config'> & { config: GameConfig }>;
}

/** A score as the client holds it: server state plus whether it is still pending. */
export interface LocalScore {
  roundPlayerId: string;
  hole: number;
  strokes: number | null;
  putts: number | null;
  penalties: number | null;
  /** Server-assigned version last seen. 0 means the row has never landed. */
  version: number;
  pending: boolean;
  clientId: string;
  updatedAt: string;
}

export type ScoreDraft = Pick<
  LocalScore,
  'roundPlayerId' | 'hole' | 'strokes' | 'putts' | 'penalties'
>;

export interface OutboxItem {
  id: string;
  kind: 'score';
  payload: ScoreDraft & { clientId: string; baseVersion: number; clientUpdatedAt: string };
  attempts: number;
  queuedAt: string;
}

export type { ScoreRow };
