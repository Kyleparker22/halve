import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  netPositions,
  owesMatrix,
  simplifyDebts,
  type LedgerEntryDraft,
  type Payment,
} from '@halve/ledger';
import type { Json, LedgerEntryRow, ProfileRow, SettleMethod, SettlementRow } from '@halve/types';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/query';

export interface LedgerView {
  entries: Array<LedgerEntryRow & { from: ProfileRow | null; to: ProfileRow | null }>;
  open: LedgerEntryDraft[];
  positions: ReturnType<typeof netPositions>;
  matrix: ReturnType<typeof owesMatrix>;
  payments: Payment[];
}

export function useCrewLedger(crewId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.crewLedger(crewId ?? 'none'),
    enabled: Boolean(crewId),
    queryFn: async (): Promise<LedgerView> => {
      const { data, error } = await supabase
        .from('ledger_entries')
        .select(
          '*, from:profiles!ledger_entries_from_profile_fkey(*), to:profiles!ledger_entries_to_profile_fkey(*)',
        )
        .eq('crew_id', crewId!)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const entries = (data ?? []) as unknown as LedgerView['entries'];
      const open: LedgerEntryDraft[] = entries
        .filter((entry) => entry.status === 'open')
        .map((entry) => ({
          fromProfile: entry.from_profile,
          toProfile: entry.to_profile,
          amountCents: entry.amount_cents,
        }));

      return {
        entries,
        open,
        positions: netPositions(open),
        matrix: owesMatrix(open),
        // Debt simplification: a crew of eight settles in the fewest payments.
        payments: simplifyDebts(open),
      };
    },
  });
}

export function useAddManualEntry(crewId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      fromProfile: string;
      toProfile: string;
      amountCents: number;
      note: string;
    }) => {
      const { error } = await supabase.from('ledger_entries').insert({
        crew_id: crewId,
        trip_id: null,
        from_profile: input.fromProfile,
        to_profile: input.toProfile,
        amount_cents: input.amountCents,
        source_type: 'manual',
        source_id: null,
        note: input.note,
        batch_id: null,
      });
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.crewLedger(crewId) }),
  });
}

/**
 * Corrections are new offsetting entries, never edits — ledger rows are
 * immutable and the database trigger enforces it.
 */
export function useReverseEntry(crewId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (entry: LedgerEntryRow) => {
      const { error } = await supabase.from('ledger_entries').insert({
        crew_id: entry.crew_id,
        trip_id: entry.trip_id,
        from_profile: entry.to_profile,
        to_profile: entry.from_profile,
        amount_cents: entry.amount_cents,
        source_type: 'adjustment',
        source_id: entry.id,
        note: `Reverses: ${entry.note ?? entry.source_type}`,
        batch_id: null,
      });
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.crewLedger(crewId) }),
  });
}

export function useSettlements(crewId: string | undefined) {
  return useQuery({
    queryKey: ['crew', crewId, 'settlements'],
    enabled: Boolean(crewId),
    queryFn: async (): Promise<SettlementRow[]> => {
      const { data, error } = await supabase
        .from('settlements')
        .select('*, settlement_batches!inner(crew_id, status)')
        .eq('settlement_batches.crew_id', crewId!)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SettlementRow[];
    },
  });
}

export function useOpenSettlementBatch(crewId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ payments, tripId }: { payments: Payment[]; tripId?: string | null }) => {
      const { data, error } = await supabase.rpc('open_settlement_batch', {
        p_crew_id: crewId,
        p_trip_id: tripId ?? null,
        p_payments: payments.map((p) => ({
          from: p.fromProfile,
          to: p.toProfile,
          amount_cents: p.amountCents,
        })) as unknown as Json,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.crewLedger(crewId) });
      void client.invalidateQueries({ queryKey: ['crew', crewId, 'settlements'] });
    },
  });
}

/**
 * Entries close only when every settlement in the batch confirms — partial
 * confirmation leaves them open with a visible pending state.
 */
export function useConfirmSettlement(crewId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ settlementId, method }: { settlementId: string; method: SettleMethod }) => {
      const { error } = await supabase.rpc('confirm_settlement', {
        p_settlement_id: settlementId,
        p_method: method,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.crewLedger(crewId) });
      void client.invalidateQueries({ queryKey: ['crew', crewId, 'settlements'] });
    },
  });
}

export function useCancelBatch(crewId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (batchId: string) => {
      const { error } = await supabase.rpc('cancel_settlement_batch', { p_batch_id: batchId });
      if (error) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.crewLedger(crewId) });
      void client.invalidateQueries({ queryKey: ['crew', crewId, 'settlements'] });
    },
  });
}
