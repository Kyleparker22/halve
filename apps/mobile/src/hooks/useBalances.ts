import { useQuery } from '@tanstack/react-query';
import type { CrewBalanceRow } from '@halve/types';
import { supabase } from '../lib/supabase';

/**
 * The season balance, straight from the crew_balances view. The view is
 * security_invoker, so this returns only crews the caller belongs to.
 */
export function useCrewBalancesForMe(profileId: string | undefined) {
  return useQuery({
    queryKey: ['balances', profileId],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<CrewBalanceRow[]> => {
      const { data, error } = await supabase
        .from('crew_balances')
        .select('*')
        .eq('profile_id', profileId!);
      if (error) throw error;
      return (data ?? []) as CrewBalanceRow[];
    },
  });
}

export function useCrewBalances(crewId: string | undefined) {
  return useQuery({
    queryKey: ['crew', crewId, 'balances'],
    enabled: Boolean(crewId),
    queryFn: async (): Promise<CrewBalanceRow[]> => {
      const { data, error } = await supabase
        .from('crew_balances')
        .select('*')
        .eq('crew_id', crewId!);
      if (error) throw error;
      return (data ?? []) as CrewBalanceRow[];
    },
  });
}
