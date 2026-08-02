import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FeedItemRow, MessageRow, OpenSeatRow, ProfileRow } from '@halve/types';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/query';

/** Two hops, never public. The function is security definer; the client cannot walk the graph. */
export function useOpenSeats() {
  return useQuery({
    queryKey: queryKeys.openSeats,
    queryFn: async (): Promise<OpenSeatRow[]> => {
      const { data, error } = await supabase.rpc('visible_open_seats');
      if (error) throw error;
      return (data ?? []) as OpenSeatRow[];
    },
  });
}

export function useRequestSeat() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (roundId: string) => {
      const { data, error } = await supabase.rpc('request_open_seat', { p_round_id: roundId });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.openSeats }),
  });
}

export function useSeatRequests(roundId: string | undefined) {
  return useQuery({
    queryKey: ['round', roundId, 'seat-requests'],
    enabled: Boolean(roundId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seat_requests')
        .select('*, profiles!inner(display_name, handle, avatar_url)')
        .eq('round_id', roundId!)
        .eq('status', 'requested');
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        profile_id: string;
        profiles: Pick<ProfileRow, 'display_name' | 'handle' | 'avatar_url'>;
      }>;
    },
  });
}

export function useApproveSeat(roundId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.rpc('approve_seat_request', { p_request_id: requestId });
      if (error) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['round', roundId, 'seat-requests'] });
      void client.invalidateQueries({ queryKey: queryKeys.roundBundle(roundId) });
    },
  });
}

export function useFeed(crewId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.feed(crewId ?? 'none'),
    enabled: Boolean(crewId),
    queryFn: async (): Promise<Array<FeedItemRow & { actor: ProfileRow | null }>> => {
      const { data, error } = await supabase
        .from('feed_items')
        .select('*, actor:profiles(*)')
        .eq('crew_id', crewId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Array<FeedItemRow & { actor: ProfileRow | null }>;
    },
  });
}

export function useReact(crewId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      feedItemId,
      profileId,
      emoji,
    }: {
      feedItemId: string;
      profileId: string;
      emoji: string;
    }) => {
      const { error } = await supabase
        .from('reactions')
        .upsert({ feed_item_id: feedItemId, profile_id: profileId, emoji });
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.feed(crewId) }),
  });
}

export type ChatScope = 'crew' | 'round' | 'trip';

export function useMessages(scope: ChatScope, id: string | undefined) {
  const client = useQueryClient();
  const column = `${scope}_id` as const;

  const query = useQuery({
    queryKey: queryKeys.messages(scope, id ?? 'none'),
    enabled: Boolean(id),
    queryFn: async (): Promise<Array<MessageRow & { author: ProfileRow | null }>> => {
      const { data, error } = await supabase
        .from('messages')
        .select('*, author:profiles(*)')
        .eq(column, id!)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Array<MessageRow & { author: ProfileRow | null }>;
    },
  });

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`chat:${scope}:${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `${column}=eq.${id}` },
        () => {
          void client.invalidateQueries({ queryKey: queryKeys.messages(scope, id) });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [client, column, id, scope]);

  return query;
}

export function useSendMessage(scope: ChatScope, id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, authorId }: { body: string; authorId: string }) => {
      const { error } = await supabase.from('messages').insert({
        crew_id: scope === 'crew' ? id : null,
        round_id: scope === 'round' ? id : null,
        trip_id: scope === 'trip' ? id : null,
        author_id: authorId,
        body,
      });
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.messages(scope, id) }),
  });
}
