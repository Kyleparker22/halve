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

/**
 * Attaches a receipt photo to an expense.
 *
 * The bucket is private, so nothing here produces a public URL: the object path
 * is stored and read back through a signed URL. A receipt carries a card's last
 * four, a place and a time, which is not something to leave world-readable
 * behind a guessable address.
 */
export function useAttachReceipt(tripId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ expenseId, uri }: { expenseId: string; uri: string }) => {
      const response = await fetch(uri);
      const body = await response.arrayBuffer();
      const extension = uri.split('.').pop()?.toLowerCase().split('?')[0] ?? 'jpg';
      const path = `${tripId}/${expenseId}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(path, body, {
          contentType: response.headers.get('content-type') ?? `image/${extension}`,
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { error } = await supabase
        .from('trip_expenses')
        .update({ receipt_url: path })
        .eq('id', expenseId);
      if (error) throw error;
      return path;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.tripExpenses(tripId) }),
  });
}

/** Signed URL for a stored receipt path. Expires — that is the point of it. */
export function useReceiptUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['receipt', path ?? 'none'],
    enabled: Boolean(path),
    staleTime: 1000 * 60 * 30,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.storage
        .from('receipts')
        .createSignedUrl(path!, 60 * 60);
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
  });
}

export interface TripStanding {
  key: string;
  name: string;
  isGuest: boolean;
  roundsPlayed: number;
  grossTotal: number;
  netTotal: number;
  /** Best single round of the trip, gross. */
  bestGross: number | null;
  bestRoundId: string | null;
}

export interface TripRecap {
  standings: TripStanding[];
  lowRound: { name: string; strokes: number; roundId: string } | null;
  roundsPlayed: number;
}

/**
 * Standings across a trip's rounds.
 *
 * Only rounds that are actually finished count. A trip in progress otherwise
 * shows whoever teed off first as the runaway leader, because a player with
 * three holes scored has a lower total than one who has played eighteen.
 *
 * People are keyed by profile or guest id rather than round_player id — the
 * whole point is that one person's four rounds add up, and they are a different
 * round_player on each of them.
 */
export function useTripRecap(tripId: string | undefined) {
  return useQuery({
    queryKey: ['trip', tripId ?? 'none', 'recap'],
    enabled: Boolean(tripId),
    queryFn: async (): Promise<TripRecap> => {
      const { data: rounds } = await supabase
        .from('rounds')
        .select('id, hole_count, status')
        .eq('trip_id', tripId!);

      const finished = (rounds ?? []).filter((r) => r.status === 'completed');
      if (finished.length === 0) return { standings: [], lowRound: null, roundsPlayed: 0 };

      const { data: players, error } = await supabase
        .from('round_players')
        .select(
          'id, round_id, profile_id, guest_id, playing_handicap, profiles(display_name), crew_guests(name), scores(strokes)',
        )
        .in(
          'round_id',
          finished.map((r) => r.id),
        );
      if (error) throw error;

      const byPerson = new Map<string, TripStanding>();
      let lowRound: TripRecap['lowRound'] = null;

      for (const row of (players ?? []) as unknown as Array<{
        id: string;
        round_id: string;
        profile_id: string | null;
        guest_id: string | null;
        playing_handicap: number | null;
        profiles: { display_name: string } | null;
        crew_guests: { name: string } | null;
        scores: Array<{ strokes: number | null }>;
      }>) {
        const holesScored = row.scores.filter((s) => s.strokes !== null);
        // A card that was never filled in is not a round played.
        if (holesScored.length === 0) continue;

        const gross = holesScored.reduce((sum, s) => sum + (s.strokes ?? 0), 0);
        const net = gross - (row.playing_handicap ?? 0);
        const key = row.profile_id ? `p:${row.profile_id}` : `g:${row.guest_id}`;
        const name = row.profiles?.display_name ?? row.crew_guests?.name ?? 'Player';

        const current =
          byPerson.get(key) ??
          ({
            key,
            name,
            isGuest: row.guest_id !== null,
            roundsPlayed: 0,
            grossTotal: 0,
            netTotal: 0,
            bestGross: null,
            bestRoundId: null,
          } satisfies TripStanding);

        current.roundsPlayed += 1;
        current.grossTotal += gross;
        current.netTotal += net;
        if (current.bestGross === null || gross < current.bestGross) {
          current.bestGross = gross;
          current.bestRoundId = row.round_id;
        }
        byPerson.set(key, current);

        if (!lowRound || gross < lowRound.strokes) {
          lowRound = { name, strokes: gross, roundId: row.round_id };
        }
      }

      return {
        standings: [...byPerson.values()].sort(
          (a, b) => a.netTotal - b.netTotal || a.name.localeCompare(b.name),
        ),
        lowRound,
        roundsPlayed: finished.length,
      };
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
