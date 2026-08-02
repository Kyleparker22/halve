/**
 * Hand-written stand-in for `supabase gen types typescript`.
 *
 * Regenerate against a running database with `pnpm gen:types` — this file is
 * kept faithful to supabase/migrations by hand until then, and the generated
 * output should replace it wholesale.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type CrewRole = 'owner' | 'admin' | 'member';
export type RoundStatus = 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type RsvpStatus = 'invited' | 'in' | 'out' | 'maybe';
export type RoundVisibility = 'crew' | 'friends_of_friends';
export type GameTypeName =
  | 'nassau'
  | 'skins'
  | 'match'
  | 'stroke'
  | 'bestball'
  | 'wolf'
  | 'stableford';
export type LedgerSource = 'game' | 'trip_expense' | 'manual' | 'adjustment';
export type LedgerStatus = 'open' | 'settled' | 'void';
export type SettleMethod = 'venmo' | 'cashapp' | 'cash' | 'other';
export type SettleStatus = 'draft' | 'requested' | 'confirmed' | 'cancelled';
export type TripStatus = 'planning' | 'confirmed' | 'active' | 'completed' | 'cancelled';
export type MemberStatus = 'invited' | 'in' | 'out' | 'maybe';
export type HandicapSource = 'self' | 'ghin' | 'computed';

type NullableKeys<T> = { [K in keyof T]-?: null extends T[K] ? K : never }[keyof T];

/**
 * Insert makes server-defaulted and nullable columns optional, which is what
 * the Supabase generator does; Update makes everything optional.
 */
type Table<Row, Defaulted extends keyof Row = never> = {
  Row: Row;
  Insert: Omit<Row, Defaulted | NullableKeys<Row>> & Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type CourseRow = {
  id: string;
  source: string;
  external_id: string | null;
  name: string;
  club_name: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  hole_count: number;
  needs_review: boolean;
  raw: Json | null;
  created_at: string | null;
  updated_at: string | null;
}

export type TeeRow = {
  id: string;
  course_id: string;
  name: string;
  gender: string | null;
  par: number;
  yardage: number | null;
  rating: number | null;
  slope: number | null;
  created_at: string | null;
}

export type HoleRow = {
  id: string;
  tee_id: string;
  number: number;
  par: number;
  yardage: number | null;
  stroke_index: number;
}

export type ProfileRow = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  phone_hash: string | null;
  home_course_id: string | null;
  handicap_index: number | null;
  handicap_source: HandicapSource | null;
  deleted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type DeviceRow = {
  id: string;
  profile_id: string;
  push_token: string;
  platform: 'ios' | 'android';
  last_seen_at: string | null;
  created_at: string | null;
}

export type FriendshipRow = {
  profile_id: string;
  friend_id: string;
  created_at: string | null;
}

export type CrewRow = {
  id: string;
  name: string;
  avatar_url: string | null;
  invite_code: string;
  created_by: string | null;
  created_at: string | null;
}

export type CrewMemberRow = {
  crew_id: string;
  profile_id: string;
  role: CrewRole;
  joined_at: string | null;
}

export type CrewGuestRow = {
  id: string;
  crew_id: string;
  name: string;
  vouched_by: string;
  created_at: string | null;
}

export type TripRow = {
  id: string;
  crew_id: string;
  name: string;
  destination: string | null;
  start_date: string;
  end_date: string;
  cover_url: string | null;
  status: TripStatus;
  invite_code: string;
  created_by: string | null;
  created_at: string | null;
}

export type RoomRow = {
  id: string;
  trip_id: string;
  name: string;
  capacity: number;
  cost_cents: number;
  paid_by: string | null;
}

export type TripMemberRow = {
  id: string;
  trip_id: string;
  profile_id: string | null;
  guest_id: string | null;
  status: MemberStatus;
  arrives_at: string | null;
  departs_at: string | null;
  room_id: string | null;
  created_at: string | null;
}

export type TripExpenseRow = {
  id: string;
  trip_id: string;
  description: string;
  amount_cents: number;
  paid_by: string;
  room_id: string | null;
  receipt_url: string | null;
  created_at: string | null;
}

export type TripExpenseShareRow = {
  expense_id: string;
  trip_member_id: string;
  amount_cents: number;
}

export type RoundRow = {
  id: string;
  crew_id: string | null;
  trip_id: string | null;
  course_id: string;
  tee_id: string | null;
  name: string | null;
  scheduled_at: string;
  timezone: string;
  hole_count: number;
  nine: 'front' | 'back' | null;
  status: RoundStatus;
  visibility: RoundVisibility;
  max_players: number | null;
  booking_provider: string | null;
  booking_external_id: string | null;
  booking_url: string | null;
  booking_status: string | null;
  created_by: string | null;
  completed_at: string | null;
  created_at: string | null;
}

export type RoundPlayerRow = {
  id: string;
  round_id: string;
  profile_id: string | null;
  guest_id: string | null;
  rsvp: RsvpStatus;
  playing_handicap: number | null;
  tee_id: string | null;
  position: number | null;
  created_at: string | null;
}

export type ScoreRow = {
  id: string;
  round_player_id: string;
  hole_number: number;
  strokes: number | null;
  putts: number | null;
  penalties: number | null;
  version: number;
  client_id: string;
  client_updated_at: string;
  updated_by: string | null;
  updated_at: string | null;
}

export type GameRow = {
  id: string;
  round_id: string | null;
  trip_id: string | null;
  type: GameTypeName;
  name: string | null;
  config: Json;
  created_by: string | null;
  computed_at: string | null;
  created_at: string | null;
}

export type GameParticipantRow = {
  game_id: string;
  round_player_id: string;
  team_id: string | null;
}

export type GameResultRow = {
  id: string;
  game_id: string;
  round_player_id: string;
  amount_cents: number;
  breakdown: Json;
  computed_at: string | null;
}

export type SettlementBatchRow = {
  id: string;
  crew_id: string;
  trip_id: string | null;
  created_by: string;
  status: SettleStatus;
  created_at: string | null;
  closed_at: string | null;
}

export type SettlementRow = {
  id: string;
  batch_id: string;
  from_profile: string;
  to_profile: string;
  amount_cents: number;
  method: SettleMethod | null;
  status: SettleStatus;
  external_ref: string | null;
  confirmed_by: string | null;
  created_at: string | null;
  confirmed_at: string | null;
}

export type LedgerEntryRow = {
  id: string;
  crew_id: string;
  trip_id: string | null;
  from_profile: string;
  to_profile: string;
  amount_cents: number;
  source_type: LedgerSource;
  source_id: string | null;
  note: string | null;
  status: LedgerStatus;
  batch_id: string | null;
  created_at: string | null;
}

export type FeedItemRow = {
  id: string;
  crew_id: string;
  actor_id: string | null;
  type: string;
  subject_type: string | null;
  subject_id: string | null;
  payload: Json;
  created_at: string | null;
}

export type ReactionRow = {
  feed_item_id: string;
  profile_id: string;
  emoji: string;
  created_at: string | null;
}

export type MessageRow = {
  id: string;
  round_id: string | null;
  trip_id: string | null;
  crew_id: string | null;
  author_id: string | null;
  body: string;
  created_at: string | null;
}

export type SeatRequestRow = {
  id: string;
  round_id: string;
  profile_id: string;
  status: 'requested' | 'approved' | 'declined';
  created_at: string | null;
}

export type NotificationKind =
  | 'crew_invite'
  | 'round_invite'
  | 'trip_invite'
  | 'rsvp_nudge'
  | 'round_starting'
  | 'seat_requested'
  | 'seat_approved'
  | 'scores_entered'
  | 'round_completed'
  | 'settlement_requested'
  | 'settlement_confirmed'
  | 'trip_updated'
  | 'message';

export type NotificationPrefRow = {
  profile_id: string;
  kind: NotificationKind;
  enabled: boolean;
}

export type NotificationQueueRow = {
  id: string;
  profile_id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  data: Json;
  send_after: string;
  sent_at: string | null;
  attempts: number;
  created_at: string | null;
}

export type CrewBalanceRow = {
  crew_id: string;
  profile_id: string;
  net_cents: number;
}

export type OpenSeatRow = {
  round_id: string;
  course_name: string;
  scheduled_at: string;
  timezone: string;
  open_seats: number;
  host_crew_name: string;
  vouch_profile_id: string;
  vouch_display_name: string;
}

export type Database = {
  public: {
    Tables: {
      courses: Table<CourseRow, 'id' | 'created_at' | 'updated_at' | 'hole_count' | 'needs_review'>;
      tees: Table<TeeRow, 'id' | 'created_at'>;
      holes: Table<HoleRow, 'id'>;
      profiles: Table<ProfileRow, 'created_at' | 'updated_at' | 'handicap_source' | 'deleted_at'>;
      devices: Table<DeviceRow, 'id' | 'created_at' | 'last_seen_at'>;
      friendships: Table<FriendshipRow, 'created_at'>;
      crews: Table<CrewRow, 'id' | 'created_at'>;
      crew_members: Table<CrewMemberRow, 'role' | 'joined_at'>;
      crew_guests: Table<CrewGuestRow, 'id' | 'created_at'>;
      trips: Table<TripRow, 'id' | 'created_at' | 'status'>;
      rooms: Table<RoomRow, 'id' | 'cost_cents'>;
      trip_members: Table<TripMemberRow, 'id' | 'created_at' | 'status'>;
      trip_expenses: Table<TripExpenseRow, 'id' | 'created_at'>;
      trip_expense_shares: Table<TripExpenseShareRow>;
      rounds: Table<
        RoundRow,
        'id' | 'created_at' | 'status' | 'visibility' | 'hole_count' | 'completed_at'
      >;
      round_players: Table<RoundPlayerRow, 'id' | 'created_at' | 'rsvp'>;
      scores: Table<ScoreRow, 'id' | 'version' | 'updated_at' | 'updated_by'>;
      games: Table<GameRow, 'id' | 'created_at' | 'computed_at'>;
      game_participants: Table<GameParticipantRow>;
      game_results: Table<GameResultRow, 'id' | 'computed_at'>;
      settlement_batches: Table<SettlementBatchRow, 'id' | 'created_at' | 'status' | 'closed_at'>;
      settlements: Table<
        SettlementRow,
        'id' | 'created_at' | 'status' | 'confirmed_at' | 'confirmed_by'
      >;
      ledger_entries: Table<LedgerEntryRow, 'id' | 'created_at' | 'status'>;
      feed_items: Table<FeedItemRow, 'id' | 'created_at' | 'payload'>;
      reactions: Table<ReactionRow, 'created_at'>;
      messages: Table<MessageRow, 'id' | 'created_at'>;
      seat_requests: Table<SeatRequestRow, 'id' | 'created_at' | 'status'>;
      notification_prefs: Table<NotificationPrefRow, 'enabled'>;
      notification_queue: Table<
        NotificationQueueRow,
        'id' | 'created_at' | 'sent_at' | 'attempts' | 'send_after' | 'data'
      >;
    };
    Views: {
      crew_balances: { Row: CrewBalanceRow; Relationships: [] };
    };
    Functions: {
      upsert_score: {
        Args: {
          p_round_player_id: string;
          p_hole_number: number;
          p_strokes: number | null;
          p_putts: number | null;
          p_penalties: number | null;
          p_client_id: string;
          p_client_updated_at: string;
          p_base_version: number;
        };
        Returns: ScoreRow;
      };
      join_crew_by_code: { Args: { p_code: string }; Returns: string };
      join_trip_by_code: { Args: { p_code: string }; Returns: string };
      crew_preview: {
        Args: { p_code: string };
        Returns: Array<{ crew_id: string; name: string; member_count: number }>;
      };
      visible_open_seats: { Args: Record<string, never>; Returns: OpenSeatRow[] };
      request_open_seat: { Args: { p_round_id: string }; Returns: string };
      approve_seat_request: { Args: { p_request_id: string }; Returns: void };
      open_settlement_batch: {
        Args: { p_crew_id: string; p_trip_id: string | null; p_payments: Json };
        Returns: string;
      };
      confirm_settlement: {
        Args: { p_settlement_id: string; p_method: SettleMethod };
        Returns: void;
      };
      cancel_settlement_batch: { Args: { p_batch_id: string }; Returns: void };
      split_expense_evenly: { Args: { p_expense_id: string; p_member_ids: string[] }; Returns: void };
      delete_account: { Args: { p_profile_id?: string | null }; Returns: void };
    };
    Enums: {
      crew_role: CrewRole;
      round_status: RoundStatus;
      rsvp_status: RsvpStatus;
      round_visibility: RoundVisibility;
      game_type: GameTypeName;
      ledger_source: LedgerSource;
      ledger_status: LedgerStatus;
      settle_method: SettleMethod;
      settle_status: SettleStatus;
      trip_status: TripStatus;
      member_status: MemberStatus;
      handicap_source: HandicapSource;
    };
    CompositeTypes: Record<string, never>;
  };
}
