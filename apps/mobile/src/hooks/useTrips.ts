import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { splitEvenly } from '@halve/ledger';
import type {
  CrewGuestRow,
  ProfileRow,
  RoomRow,
  RoundRow,
  TripExpenseRow,
  TripMemberRow,
  TripRow,
} from '@halve/types';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/query';
import { inviteCode } from '../lib/invite-code';

export function useTrips() {
  return useQuery({
    queryKey: queryKeys.trips,
    queryFn: async (): Promise<Array<TripRow & { crewName: string | null }>> => {
      const { data, error } = await supabase
        .from('trips')
        .select('*, crews(name)')
        .order('start_date', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as Array<TripRow & { crews: { name: string } | null }>).map(
        (row) => ({ ...row, crewName: row.crews?.name ?? null }),
      );
    },
  });
}

export interface TripMemberEntry extends TripMemberRow {
  name: string;
  isGuest: boolean;
  settlesToProfileId: string | null;
}

export interface PairedPlayer {
  roundPlayerId: string;
  name: string;
  groupNumber: number | null;
}

export interface TripDetail {
  trip: TripRow;
  members: TripMemberEntry[];
  rooms: RoomRow[];
  rounds: RoundRow[];
  /**
   * The pairings actually stored on each round, keyed by round id. Read rather
   * than recomputed: a generated-on-render pairing cannot be overridden and
   * silently reshuffles whenever the roster moves.
   */
  pairingsByRound: Record<string, PairedPlayer[]>;
}

export function useTrip(tripId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.trip(tripId ?? 'none'),
    enabled: Boolean(tripId),
    queryFn: async (): Promise<TripDetail> => {
      const [{ data: trip, error }, members, rooms, rounds] = await Promise.all([
        supabase.from('trips').select('*').eq('id', tripId!).single(),
        supabase
          .from('trip_members')
          .select('*, profiles(display_name, id), crew_guests(name, vouched_by)')
          .eq('trip_id', tripId!),
        supabase.from('rooms').select('*').eq('trip_id', tripId!).order('name'),
        supabase
          .from('rounds')
          .select('*')
          .eq('trip_id', tripId!)
          .order('scheduled_at', { ascending: true }),
      ]);
      if (error) throw error;

      const rows = (members.data ?? []) as unknown as Array<
        TripMemberRow & {
          profiles: Pick<ProfileRow, 'id' | 'display_name'> | null;
          crew_guests: Pick<CrewGuestRow, 'name' | 'vouched_by'> | null;
        }
      >;

      const roundList = (rounds.data ?? []) as RoundRow[];

      const pairingsByRound: Record<string, PairedPlayer[]> = {};
      if (roundList.length > 0) {
        const { data: paired } = await supabase
          .from('round_players')
          .select('id, round_id, group_number, position, profiles(display_name), crew_guests(name)')
          .in(
            'round_id',
            roundList.map((r) => r.id),
          )
          .order('group_number', { nullsFirst: false })
          .order('position');

        for (const row of (paired ?? []) as unknown as Array<{
          id: string;
          round_id: string;
          group_number: number | null;
          profiles: { display_name: string } | null;
          crew_guests: { name: string } | null;
        }>) {
          (pairingsByRound[row.round_id] ??= []).push({
            roundPlayerId: row.id,
            name: row.profiles?.display_name ?? row.crew_guests?.name ?? 'Player',
            groupNumber: row.group_number,
          });
        }
      }

      return {
        trip: trip as TripRow,
        members: rows.map((row) => ({
          ...row,
          name: row.profiles?.display_name ?? row.crew_guests?.name ?? 'Member',
          isGuest: row.guest_id !== null,
          settlesToProfileId: row.profile_id ?? row.crew_guests?.vouched_by ?? null,
        })),
        rooms: (rooms.data ?? []) as RoomRow[],
        rounds: roundList,
        pairingsByRound,
      };
    },
  });
}

export function useCreateTrip() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      crewId: string;
      name: string;
      destination: string;
      startDate: string;
      endDate: string;
      createdBy: string;
    }) => {
      const { data, error } = await supabase
        .from('trips')
        .insert({
          crew_id: input.crewId,
          name: input.name,
          destination: input.destination,
          start_date: input.startDate,
          end_date: input.endDate,
          invite_code: inviteCode(),
          created_by: input.createdBy,
          cover_url: null,
        })
        .select()
        .single();
      if (error) throw error;

      const { error: memberError } = await supabase.from('trip_members').insert({
        trip_id: data.id,
        profile_id: input.createdBy,
        guest_id: null,
        status: 'in',
        arrives_at: null,
        departs_at: null,
        room_id: null,
      });
      if (memberError) throw memberError;

      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.trips }),
  });
}

export function useAssignRoom(tripId: string) {
  const client = useQueryClient();
  return useMutation({
    // Reassignment re-derives the room's expense split in the database.
    mutationFn: async ({ memberId, roomId }: { memberId: string; roomId: string | null }) => {
      const { error } = await supabase
        .from('trip_members')
        .update({ room_id: roomId })
        .eq('id', memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.trip(tripId) });
      void client.invalidateQueries({ queryKey: queryKeys.tripExpenses(tripId) });
    },
  });
}

export function useTripExpenses(tripId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tripExpenses(tripId ?? 'none'),
    enabled: Boolean(tripId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trip_expenses')
        .select('*, trip_expense_shares(trip_member_id, amount_cents)')
        .eq('trip_id', tripId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Array<
        TripExpenseRow & {
          trip_expense_shares: Array<{ trip_member_id: string; amount_cents: number }>;
        }
      >;
    },
  });
}

export function useAddExpense(tripId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      description: string;
      amountCents: number;
      paidByMemberId: string;
      shareMemberIds: string[];
      custom?: Array<{ tripMemberId: string; amountCents: number }>;
    }) => {
      const { data, error } = await supabase
        .from('trip_expenses')
        .insert({
          trip_id: tripId,
          description: input.description,
          amount_cents: input.amountCents,
          paid_by: input.paidByMemberId,
          room_id: null,
          receipt_url: null,
        })
        .select()
        .single();
      if (error) throw error;

      const shares = input.custom ?? splitEvenly(input.amountCents, input.shareMemberIds);
      const { error: shareError } = await supabase.from('trip_expense_shares').insert(
        shares.map((share) => ({
          expense_id: data.id,
          trip_member_id: share.tripMemberId,
          amount_cents: share.amountCents,
        })),
      );
      if (shareError) throw shareError;

      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.tripExpenses(tripId) }),
  });
}

export function useCreateRoom(tripId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; capacity: number; costCents: number }) => {
      const { data, error } = await supabase.rpc('create_room', {
        p_trip_id: tripId,
        p_name: input.name,
        p_capacity: input.capacity,
        p_cost_cents: input.costCents,
      });
      if (error) throw error;
      return data as unknown as RoomRow;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.trip(tripId) });
      void client.invalidateQueries({ queryKey: queryKeys.tripExpenses(tripId) });
    },
  });
}

/** Who is coming, and when they land — the columns existed and nothing wrote them. */
export function useUpdateTripMember(tripId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      memberId: string;
      status?: 'invited' | 'in' | 'out' | 'maybe';
      arrivesAt?: string | null;
      departsAt?: string | null;
    }) => {
      const patch: {
        status?: 'invited' | 'in' | 'out' | 'maybe';
        arrives_at?: string | null;
        departs_at?: string | null;
      } = {};
      if (input.status !== undefined) patch.status = input.status;
      if (input.arrivesAt !== undefined) patch.arrives_at = input.arrivesAt;
      if (input.departsAt !== undefined) patch.departs_at = input.departsAt;
      if (Object.keys(patch).length === 0) return;

      const { error } = await supabase.from('trip_members').update(patch).eq('id', input.memberId);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.trip(tripId) }),
  });
}

/**
 * Pushes logged expenses into the ledger. Idempotent server-side, so calling it
 * on every expense add and again before settling is correct rather than merely
 * safe — the trip's money is live as it accrues instead of appearing at the end.
 */
export function usePostTripExpenses(tripId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('post-trip-expenses', {
        body: { trip_id: tripId },
      });
      if (error) throw error;
      return data as { written: number; skipped: number; unsettleable: string[] };
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.tripBalances(tripId) });
      void client.invalidateQueries({ queryKey: queryKeys.trip(tripId) });
    },
  });
}

export interface TripBalance {
  profileId: string;
  name: string;
  netCents: number;
}

/** Net open position per person for this trip, richest first. */
export function useTripBalances(tripId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tripBalances(tripId ?? 'none'),
    enabled: Boolean(tripId),
    queryFn: async (): Promise<TripBalance[]> => {
      const { data, error } = await supabase
        .from('trip_balances')
        .select('profile_id, net_cents, profiles(display_name)')
        .eq('trip_id', tripId!);
      if (error) throw error;
      return (
        (data ?? []) as unknown as Array<{
          profile_id: string;
          net_cents: number;
          profiles: { display_name: string } | null;
        }>
      )
        .map((row) => ({
          profileId: row.profile_id,
          name: row.profiles?.display_name ?? 'Someone',
          netCents: Number(row.net_cents),
        }))
        .sort((a, b) => b.netCents - a.netCents || a.name.localeCompare(b.name));
    },
  });
}

/** Marks the trip done. Refuses while any of its ledger entries are still open. */
export function useCompleteTrip(tripId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('complete_trip', { p_trip_id: tripId });
      if (error) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.trip(tripId) });
      void client.invalidateQueries({ queryKey: queryKeys.trips });
    },
  });
}

export function useJoinTrip() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc('join_trip_by_code', { p_code: code });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.trips }),
  });
}

/**
 * Writes the generated pairings onto the trip's rounds, creating a round_player
 * for any trip member who is not on that round yet.
 *
 * Rounds that have already been played are left alone. Regenerating pairings
 * mid-trip is normal — someone drops out on day two — and renumbering a round
 * people have already scored would move the groups out from under a card that
 * is already filled in.
 */
export function useGeneratePairings(tripId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupSize = 4 }: { groupSize?: number } = {}) => {
      const [{ data: memberRows }, { data: roundRows }] = await Promise.all([
        supabase.from('trip_members').select('id, profile_id, guest_id, status').eq('trip_id', tripId),
        supabase
          .from('rounds')
          .select('id, tee_id, status')
          .eq('trip_id', tripId)
          .order('scheduled_at', { ascending: true }),
      ]);

      const going = (memberRows ?? []).filter((m) => m.status === 'in');
      const rounds = (roundRows ?? []).filter((r) => r.status === 'scheduled');
      if (going.length === 0 || rounds.length === 0) return { rounds: 0 };

      const plan = generatePairings(
        going.map((m) => m.id),
        rounds.length,
        groupSize,
      );

      for (const [roundIndex, round] of rounds.entries()) {
        const { data: existing } = await supabase
          .from('round_players')
          .select('id, profile_id, guest_id, position')
          .eq('round_id', round.id);

        // A trip member and a round player are the same person identified two
        // ways; match on whichever id they carry.
        const keyOf = (row: { profile_id: string | null; guest_id: string | null }) =>
          row.profile_id ? `p:${row.profile_id}` : `g:${row.guest_id}`;
        const byKey = new Map((existing ?? []).map((row) => [keyOf(row), row]));
        let nextPosition = (existing ?? []).reduce((max, r) => Math.max(max, r.position ?? 0), 0);

        for (const [groupIndex, group] of (plan[roundIndex] ?? []).entries()) {
          for (const memberId of group) {
            const member = going.find((m) => m.id === memberId);
            if (!member) continue;
            const existingRow = byKey.get(keyOf(member));

            if (existingRow) {
              const { error } = await supabase
                .from('round_players')
                .update({ group_number: groupIndex + 1 })
                .eq('id', existingRow.id);
              if (error) throw error;
            } else {
              const { error } = await supabase.from('round_players').insert({
                round_id: round.id,
                profile_id: member.profile_id,
                guest_id: member.guest_id,
                rsvp: member.profile_id ? 'invited' : 'in',
                position: (nextPosition += 1),
                tee_id: round.tee_id,
                group_number: groupIndex + 1,
                playing_handicap: null,
              });
              if (error) throw error;
            }
          }
        }
      }

      return { rounds: rounds.length };
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.trip(tripId) });
      void client.invalidateQueries({ queryKey: queryKeys.rounds });
    },
  });
}

/** Move one player into a different group — the manual override M6 asks for. */
export function useSetPlayerGroup(tripId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      roundPlayerId,
      groupNumber,
    }: {
      roundPlayerId: string;
      groupNumber: number | null;
    }) => {
      const { error } = await supabase
        .from('round_players')
        .update({ group_number: groupNumber })
        .eq('id', roundPlayerId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      void client.invalidateQueries({ queryKey: queryKeys.trip(tripId) });
      void client.invalidateQueries({ queryKey: ['round'] });
      void variables;
    },
  });
}

/**
 * Foursomes across a trip's rounds with a no-repeat constraint: greedily build
 * groups that minimise how often two people have already played together.
 * Deterministic — same roster and round count, same pairings.
 */
export function generatePairings(
  memberIds: string[],
  roundCount: number,
  groupSize = 4,
): string[][][] {
  const ordered = [...memberIds].sort();
  const seen = new Map<string, number>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const cost = (group: string[], candidate: string) =>
    group.reduce((sum, member) => sum + (seen.get(pairKey(member, candidate)) ?? 0), 0);

  const rounds: string[][][] = [];

  for (let r = 0; r < roundCount; r += 1) {
    const remaining = [...ordered];
    // Rotate the starting player each round so the first group is not fixed.
    for (let i = 0; i < r % Math.max(1, ordered.length); i += 1) remaining.push(remaining.shift()!);

    const groups: string[][] = [];
    while (remaining.length > 0) {
      const group = [remaining.shift()!];
      while (group.length < groupSize && remaining.length > 0) {
        let bestIndex = 0;
        let bestCost = Number.POSITIVE_INFINITY;
        remaining.forEach((candidate, index) => {
          const c = cost(group, candidate);
          if (c < bestCost) {
            bestCost = c;
            bestIndex = index;
          }
        });
        group.push(remaining.splice(bestIndex, 1)[0]!);
      }
      for (let i = 0; i < group.length; i += 1) {
        for (let j = i + 1; j < group.length; j += 1) {
          const key = pairKey(group[i]!, group[j]!);
          seen.set(key, (seen.get(key) ?? 0) + 1);
        }
      }
      groups.push(group);
    }
    rounds.push(groups);
  }

  return rounds;
}
