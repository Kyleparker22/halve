import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Club } from '../lib/clubs';
import type { Point } from '../lib/geo';

export interface BagClub extends Club {
  id: string;
}

export function useClubs(profileId: string | undefined) {
  return useQuery({
    queryKey: ['clubs', profileId ?? 'none'],
    enabled: Boolean(profileId),
    staleTime: 1000 * 60 * 60,
    queryFn: async (): Promise<BagClub[]> => {
      const { data, error } = await supabase
        .from('player_clubs')
        .select('id, name, carry_yards')
        .eq('profile_id', profileId!)
        .order('carry_yards', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        carryYards: row.carry_yards,
      }));
    },
  });
}

export function useSaveClub(profileId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, carryYards }: { name: string; carryYards: number }) => {
      const { error } = await supabase
        .from('player_clubs')
        .upsert(
          { profile_id: profileId!, name: name.trim(), carry_yards: Math.round(carryYards) },
          { onConflict: 'profile_id,name' },
        );
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['clubs', profileId] }),
  });
}

export function useRemoveClub(profileId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('player_clubs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['clubs', profileId] }),
  });
}

export interface Weather {
  windMph: number;
  windFromDeg: number;
  tempC: number;
  altitudeM: number;
}

/**
 * Conditions from Open-Meteo.
 *
 * No API key, no account, free for this kind of use — which matters because a
 * club recommendation that stops working when a trial expires is worse than one
 * that never existed. It also returns the station elevation, which is the
 * altitude input.
 *
 * Cached for an hour and never retried hard: weather is a refinement, and a
 * scorecard that stalls on a network call in a dead spot is a broken scorecard.
 * Without it the recommendation falls back to raw distance and says so.
 */
export function useWeather(at: Point | null) {
  // Round the position so a golfer walking down the fairway does not refetch.
  const key = at ? `${at.lat.toFixed(2)},${at.lng.toFixed(2)}` : 'none';
  return useQuery({
    queryKey: ['weather', key],
    enabled: Boolean(at),
    staleTime: 1000 * 60 * 60,
    retry: false,
    queryFn: async (): Promise<Weather | null> => {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${at!.lat}&longitude=${at!.lng}` +
        `&current=temperature_2m,wind_speed_10m,wind_direction_10m&wind_speed_unit=mph`;
      const response = await fetch(url);
      if (!response.ok) return null;
      const payload = (await response.json()) as {
        elevation?: number;
        current?: {
          temperature_2m?: number;
          wind_speed_10m?: number;
          wind_direction_10m?: number;
        };
      };
      const current = payload.current;
      if (!current) return null;
      return {
        windMph: current.wind_speed_10m ?? 0,
        windFromDeg: current.wind_direction_10m ?? 0,
        tempC: current.temperature_2m ?? 21,
        altitudeM: payload.elevation ?? 0,
      };
    },
  });
}
