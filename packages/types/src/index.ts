/**
 * Domain types shared between the app and the edge functions.
 *
 * ./database is generated — `pnpm gen:types` against the linked project. Never
 * edit it by hand. Everything below is the stable surface the app imports, so a
 * regeneration cannot ripple through every call site.
 */
import type { GameConfig } from '@halve/games';
import type { Database, Json } from './database';

export type { Database, Json };

type Tables = Database['public']['Tables'];
type Views = Database['public']['Views'];
type Enums = Database['public']['Enums'];
type Functions = Database['public']['Functions'];

export type Row<T extends keyof Tables> = Tables[T]['Row'];
export type Insert<T extends keyof Tables> = Tables[T]['Insert'];
export type Update<T extends keyof Tables> = Tables[T]['Update'];

// --- enums ------------------------------------------------------------------

export type CrewRole = Enums['crew_role'];
export type RoundStatus = Enums['round_status'];
export type RsvpStatus = Enums['rsvp_status'];
export type RoundVisibility = Enums['round_visibility'];
export type GameTypeName = Enums['game_type'];
export type LedgerSource = Enums['ledger_source'];
export type LedgerStatus = Enums['ledger_status'];
export type SettleMethod = Enums['settle_method'];
export type SettleStatus = Enums['settle_status'];
export type TripStatus = Enums['trip_status'];
export type MemberStatus = Enums['member_status'];
export type HandicapSource = Enums['handicap_source'];
export type NotificationKind = Enums['notification_kind'];

// --- rows -------------------------------------------------------------------

export type CourseRow = Row<'courses'>;
export type TeeRow = Row<'tees'>;
export type HoleRow = Row<'holes'>;
export type ProfileRow = Row<'profiles'>;
export type DeviceRow = Row<'devices'>;
export type FriendshipRow = Row<'friendships'>;
export type CrewRow = Row<'crews'>;
export type CrewMemberRow = Row<'crew_members'>;
export type CrewGuestRow = Row<'crew_guests'>;
export type TripRow = Row<'trips'>;
export type RoomRow = Row<'rooms'>;
export type TripMemberRow = Row<'trip_members'>;
export type TripExpenseRow = Row<'trip_expenses'>;
export type TripExpenseShareRow = Row<'trip_expense_shares'>;
export type RoundRow = Row<'rounds'>;
export type RoundPlayerRow = Row<'round_players'>;
export type ScoreRow = Row<'scores'>;
export type GameRow = Row<'games'>;
export type GameParticipantRow = Row<'game_participants'>;
export type GameResultRow = Row<'game_results'>;
export type SettlementBatchRow = Row<'settlement_batches'>;
export type SettlementRow = Row<'settlements'>;
export type LedgerEntryRow = Row<'ledger_entries'>;
export type FeedItemRow = Row<'feed_items'>;
export type ReactionRow = Row<'reactions'>;
export type MessageRow = Row<'messages'>;
export type SeatRequestRow = Row<'seat_requests'>;
export type NotificationPrefRow = Row<'notification_prefs'>;
export type NotificationQueueRow = Row<'notification_queue'>;

/**
 * Every column of a view is nullable in the generated types, because Postgres
 * cannot prove otherwise. crew_balances never emits a null in practice — it
 * groups over non-null columns — so the app gets the narrowed shape.
 */
export type CrewBalanceRow = {
  crew_id: NonNullable<Views['crew_balances']['Row']['crew_id']>;
  profile_id: NonNullable<Views['crew_balances']['Row']['profile_id']>;
  net_cents: NonNullable<Views['crew_balances']['Row']['net_cents']>;
};

/**
 * The narrowed row visible_open_seats() returns, carrying the vouching edge.
 * Composite-type columns generate as nullable; the function's WHERE clause
 * guarantees every one of these is present.
 */
type RawOpenSeat = Functions['visible_open_seats']['Returns'][number];
export type OpenSeatRow = { [K in keyof RawOpenSeat]-?: NonNullable<RawOpenSeat[K]> };

/**
 * Postgres function arguments are nullable, and the type generator cannot say
 * so — every `int` parameter comes out as `number`. upsert_score genuinely
 * takes NULL for a hole a player picked up on, so the call site needs this
 * shape and one cast, rather than casts scattered through the sync engine.
 */
export type UpsertScoreArgs = Omit<
  Functions['upsert_score']['Args'],
  'p_strokes' | 'p_putts' | 'p_penalties'
> & {
  p_strokes: number | null;
  p_putts: number | null;
  p_penalties: number | null;
};

export type UpsertScoreRpcArgs = Functions['upsert_score']['Args'];

// --- domain -----------------------------------------------------------------

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
  rsvp: RsvpStatus;
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
  /**
   * config is parsed into the engine's discriminated union, not raw Json.
   * `participants` is load-bearing: a game is often a subset of the roster
   * (a Nassau between two of the four), and computing it over everyone
   * produces a different number than the server will.
   */
  games: Array<
    Omit<GameRow, 'config'> & {
      config: GameConfig;
      participants: Array<{ roundPlayerId: string; teamId: string | null }>;
    }
  >;
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
