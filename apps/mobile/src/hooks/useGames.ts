import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GameConfig, GameType, WolfConfig, WolfDecision } from '@halve/games';
import type { GameResultRow, Json } from '@halve/types';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/query';

export interface CreateGameInput {
  roundId: string;
  type: GameType;
  name: string | null;
  config: GameConfig;
  participants: Array<{ roundPlayerId: string; teamId?: string }>;
  createdBy: string;
}

export function useCreateGame(roundId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateGameInput) => {
      const { data, error } = await supabase
        .from('games')
        .insert({
          round_id: input.roundId,
          trip_id: null,
          type: input.type,
          name: input.name,
          config: input.config as unknown as Json,
          created_by: input.createdBy,
        })
        .select()
        .single();
      if (error) throw error;

      const { error: participantError } = await supabase.from('game_participants').insert(
        input.participants.map((p) => ({
          game_id: data.id,
          round_player_id: p.roundPlayerId,
          team_id: p.teamId ?? null,
        })),
      );
      if (participantError) throw participantError;

      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.roundBundle(roundId) }),
  });
}

export function useDeleteGame(roundId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (gameId: string) => {
      const { error } = await supabase.from('games').delete().eq('id', gameId);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.roundBundle(roundId) }),
  });
}

/**
 * The wolf's choice is data the engine cannot infer — it has to be recorded on
 * the card as the group plays, or the hole simply is not settled.
 */
export function useSetWolfDecision(roundId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      gameId,
      config,
      decision,
    }: {
      gameId: string;
      config: WolfConfig;
      decision: WolfDecision;
    }) => {
      const decisions = [
        ...config.decisions.filter((d) => d.hole !== decision.hole),
        decision,
      ].sort((a, b) => a.hole - b.hole);

      const { error } = await supabase
        .from('games')
        .update({ config: { ...config, decisions } as unknown as Json })
        .eq('id', gameId);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.roundBundle(roundId) }),
  });
}

export function useGameResults(roundId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.gameResults(roundId ?? 'none'),
    enabled: Boolean(roundId),
    queryFn: async (): Promise<GameResultRow[]> => {
      const { data, error } = await supabase
        .from('game_results')
        .select('*, games!inner(round_id)')
        .eq('games.round_id', roundId!);
      if (error) throw error;
      return (data ?? []) as unknown as GameResultRow[];
    },
  });
}

/**
 * Completion is server-authoritative: the edge function recomputes every game
 * with the same @halve/games build, writes game_results, and decomposes them
 * into ledger entries. The client never writes the settled numbers itself.
 */
export function useCompleteRound(roundId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('settle-round', {
        body: { round_id: roundId },
      });
      if (error) throw error;
      return data as { games: number; ledgerEntries: number };
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.roundBundle(roundId) });
      void client.invalidateQueries({ queryKey: queryKeys.gameResults(roundId) });
      void client.invalidateQueries({ queryKey: queryKeys.rounds });
    },
  });
}
