import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CrewGuestRow, CrewRow, ProfileRow } from '@halve/types';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/query';
import { inviteCode } from '../lib/invite-code';

export interface CrewSummary extends CrewRow {
  role: 'owner' | 'admin' | 'member';
  memberCount: number;
}

export function useCrews() {
  return useQuery({
    queryKey: queryKeys.crews,
    queryFn: async (): Promise<CrewSummary[]> => {
      const { data, error } = await supabase
        .from('crew_members')
        .select('role, crews!inner(*), crew_id')
        .order('joined_at', { ascending: true });
      if (error) throw error;

      const rows = (data ?? []) as unknown as Array<{
        role: CrewSummary['role'];
        crew_id: string;
        crews: CrewRow;
      }>;

      const counts = await supabase
        .from('crew_members')
        .select('crew_id')
        .in('crew_id', rows.map((r) => r.crew_id));
      const tally = new Map<string, number>();
      for (const row of counts.data ?? []) {
        tally.set(row.crew_id, (tally.get(row.crew_id) ?? 0) + 1);
      }

      return rows.map((row) => ({
        ...row.crews,
        role: row.role,
        memberCount: tally.get(row.crew_id) ?? 1,
      }));
    },
  });
}

export function useCrew(crewId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.crew(crewId ?? 'none'),
    enabled: Boolean(crewId),
    queryFn: async (): Promise<CrewRow | null> => {
      const { data, error } = await supabase
        .from('crews')
        .select('*')
        .eq('id', crewId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export interface CrewMemberEntry {
  profileId: string;
  role: 'owner' | 'admin' | 'member';
  profile: ProfileRow;
}

export function useCrewMembers(crewId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.crewMembers(crewId ?? 'none'),
    enabled: Boolean(crewId),
    queryFn: async (): Promise<CrewMemberEntry[]> => {
      const { data, error } = await supabase
        .from('crew_members')
        .select('profile_id, role, profiles!inner(*)')
        .eq('crew_id', crewId!);
      if (error) throw error;
      return ((data ?? []) as unknown as Array<{
        profile_id: string;
        role: CrewMemberEntry['role'];
        profiles: ProfileRow;
      }>).map((row) => ({
        profileId: row.profile_id,
        role: row.role,
        profile: row.profiles,
      }));
    },
  });
}

export function useCrewGuests(crewId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.crewGuests(crewId ?? 'none'),
    enabled: Boolean(crewId),
    queryFn: async (): Promise<CrewGuestRow[]> => {
      const { data, error } = await supabase.from('crew_guests').select('*').eq('crew_id', crewId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateCrew() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, profileId }: { name: string; profileId: string }) => {
      const { data, error } = await supabase
        .from('crews')
        .insert({ name, invite_code: inviteCode(), created_by: profileId })
        .select()
        .single();
      if (error) throw error;

      const { error: memberError } = await supabase
        .from('crew_members')
        .insert({ crew_id: data.id, profile_id: profileId, role: 'owner' });
      if (memberError) throw memberError;

      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.crews }),
  });
}

export function useJoinCrew() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc('join_crew_by_code', { p_code: code });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.crews }),
  });
}

export function useCrewPreview(code: string | undefined) {
  return useQuery({
    queryKey: ['crew-preview', code],
    enabled: Boolean(code),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('crew_preview', { p_code: code! });
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
  });
}

/** A guest belongs to the crew, not to one round, and always carries a voucher. */
export function useAddGuest(crewId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, vouchedBy }: { name: string; vouchedBy: string }) => {
      const { data, error } = await supabase
        .from('crew_guests')
        .insert({ crew_id: crewId, name, vouched_by: vouchedBy })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.crewGuests(crewId) }),
  });
}

export function useLeaveCrew() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ crewId, profileId }: { crewId: string; profileId: string }) => {
      const { error } = await supabase
        .from('crew_members')
        .delete()
        .eq('crew_id', crewId)
        .eq('profile_id', profileId);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.crews }),
  });
}
