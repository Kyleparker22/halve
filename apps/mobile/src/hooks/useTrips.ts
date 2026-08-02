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

export interface TripDetail {
  trip: TripRow;
  members: TripMemberEntry[];
  rooms: RoomRow[];
  rounds: RoundRow[];
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

      return {
        trip: trip as TripRow,
        members: rows.map((row) => ({
          ...row,
          name: row.profiles?.display_name ?? row.crew_guests?.name ?? 'Member',
          isGuest: row.guest_id !== null,
          settlesToProfileId: row.profile_id ?? row.crew_guests?.vouched_by ?? null,
        })),
        rooms: (rooms.data ?? []) as RoomRow[],
        rounds: (rounds.data ?? []) as RoundRow[],
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
