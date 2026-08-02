import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GameConfig } from '@halve/games';
import type {
  CourseRow,
  GameRow,
  HoleRow,
  RoundBundle,
  RoundPlayerRow,
  RoundRow,
  RosterEntry,
  RsvpStatus,
  TeeRow,
} from '@halve/types';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/query';

export interface RoundListItem extends RoundRow {
  courseName: string;
  crewName: string | null;
  inCount: number;
  myRsvp: RsvpStatus | null;
}

export function useRounds(profileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.rounds,
    enabled: Boolean(profileId),
    queryFn: async (): Promise<RoundListItem[]> => {
      const { data, error } = await supabase
        .from('rounds')
        .select('*, courses!inner(name), crews(name), round_players(profile_id, rsvp)')
        .order('scheduled_at', { ascending: true });
      if (error) throw error;

      return ((data ?? []) as unknown as Array<
        RoundRow & {
          courses: { name: string };
          crews: { name: string } | null;
          round_players: Array<{ profile_id: string | null; rsvp: RsvpStatus }>;
        }
      >).map((row) => ({
        ...row,
        courseName: row.courses.name,
        crewName: row.crews?.name ?? null,
        inCount: row.round_players.filter((p) => p.rsvp === 'in').length,
        myRsvp: row.round_players.find((p) => p.profile_id === profileId)?.rsvp ?? null,
      }));
    },
  });
}

/**
 * Everything the scorecard needs, in one query, cached hard. A round in
 * progress must make zero network calls to render.
 */
export function useRoundBundle(roundId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.roundBundle(roundId ?? 'none'),
    enabled: Boolean(roundId),
    staleTime: 1000 * 60 * 60,
    queryFn: async (): Promise<RoundBundle> => {
      const { data: round, error } = await supabase
        .from('rounds')
        .select('*, courses!inner(*), tees(*)')
        .eq('id', roundId!)
        .single();
      if (error) throw error;

      const row = round as unknown as RoundRow & { courses: CourseRow; tees: TeeRow | null };

      const [{ data: holes }, { data: players }, { data: games }] = await Promise.all([
        row.tee_id
          ? supabase.from('holes').select('*').eq('tee_id', row.tee_id).order('number')
          : Promise.resolve({ data: [] as HoleRow[] }),
        supabase
          .from('round_players')
          .select('*, profiles(id, display_name, handle, avatar_url), crew_guests(id, name, vouched_by)')
          .eq('round_id', roundId!)
          .order('position'),
        supabase.from('games').select('*').eq('round_id', roundId!),
      ]);

      const roster: RosterEntry[] = (
        (players ?? []) as unknown as Array<
          RoundPlayerRow & {
            profiles: { id: string; display_name: string; handle: string; avatar_url: string | null } | null;
            crew_guests: { id: string; name: string; vouched_by: string } | null;
          }
        >
      ).map((player) => ({
        id: player.id,
        roundId: player.round_id,
        profileId: player.profile_id,
        guestId: player.guest_id,
        name: player.profiles?.display_name ?? player.crew_guests?.name ?? 'Player',
        handle: player.profiles?.handle ?? null,
        avatarUrl: player.profiles?.avatar_url ?? null,
        isGuest: player.guest_id !== null,
        settlesToProfileId: player.profile_id ?? player.crew_guests?.vouched_by ?? null,
        rsvp: player.rsvp,
        playingHandicap: player.playing_handicap,
        teeId: player.tee_id,
        position: player.position,
      }));

      // A nine-hole round plays one nine; the other nine is not in the game.
      const allHoles = (holes ?? []) as HoleRow[];
      const played =
        row.hole_count === 9
          ? allHoles.filter((h) => (row.nine === 'back' ? h.number > 9 : h.number <= 9))
          : allHoles;

      return {
        round: row,
        courseName: row.courses.name,
        teeName: row.tees?.name ?? null,
        holes: played.map((h) => ({
          number: h.number,
          par: h.par,
          strokeIndex: h.stroke_index,
          yardage: h.yardage,
        })),
        roster,
        games: ((games ?? []) as GameRow[]).map((game) => ({
          ...game,
          config: game.config as unknown as GameConfig,
        })),
      };
    },
  });
}

export function useRsvp(roundId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ roundPlayerId, rsvp }: { roundPlayerId: string; rsvp: RsvpStatus }) => {
      const { error } = await supabase
        .from('round_players')
        .update({ rsvp })
        .eq('id', roundPlayerId);
      if (error) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.roundBundle(roundId) });
      void client.invalidateQueries({ queryKey: queryKeys.rounds });
    },
  });
}

export interface CreateRoundInput {
  crewId: string;
  courseId: string;
  teeId: string | null;
  scheduledAt: string;
  timezone: string;
  holeCount: 9 | 18;
  nine?: 'front' | 'back';
  maxPlayers: number;
  openSeats: boolean;
  createdBy: string;
  /** Crew members to invite. */
  profileIds: string[];
  /** Crew guests playing. */
  guestIds?: string[];
}

export function useCreateRound() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateRoundInput) => {
      const { data: round, error } = await supabase
        .from('rounds')
        .insert({
          crew_id: input.crewId,
          course_id: input.courseId,
          tee_id: input.teeId,
          scheduled_at: input.scheduledAt,
          timezone: input.timezone,
          hole_count: input.holeCount,
          nine: input.holeCount === 9 ? (input.nine ?? 'front') : null,
          max_players: input.maxPlayers,
          visibility: input.openSeats ? 'friends_of_friends' : 'crew',
          created_by: input.createdBy,
          trip_id: null,
          name: null,
          booking_provider: null,
          booking_external_id: null,
          booking_url: null,
          booking_status: null,
        })
        .select()
        .single();
      if (error) throw error;

      const rows = [
        ...input.profileIds.map((profileId, index) => ({
          round_id: round.id,
          profile_id: profileId,
          guest_id: null,
          rsvp: (profileId === input.createdBy ? 'in' : 'invited') as RsvpStatus,
          position: index + 1,
          tee_id: input.teeId,
          playing_handicap: null,
        })),
        ...(input.guestIds ?? []).map((guestId, index) => ({
          round_id: round.id,
          profile_id: null,
          guest_id: guestId,
          rsvp: 'in' as RsvpStatus,
          position: input.profileIds.length + index + 1,
          tee_id: input.teeId,
          playing_handicap: null,
        })),
      ];

      if (rows.length > 0) {
        const { error: rosterError } = await supabase.from('round_players').insert(rows);
        if (rosterError) throw rosterError;
      }

      return round;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.rounds }),
  });
}

export function useStartRound(roundId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('rounds')
        .update({ status: 'in_progress' })
        .eq('id', roundId);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.roundBundle(roundId) }),
  });
}

export function useCourseSearch(term: string) {
  return useQuery({
    queryKey: queryKeys.courses(term),
    enabled: term.trim().length >= 2,
    queryFn: async (): Promise<Array<CourseRow & { tees: TeeRow[] }>> => {
      const { data, error } = await supabase
        .from('courses')
        .select('*, tees(*)')
        .ilike('name', `%${term.trim()}%`)
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as Array<CourseRow & { tees: TeeRow[] }>;
    },
  });
}
