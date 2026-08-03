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

export interface FeedEntry extends FeedItemRow {
  actor: ProfileRow | null;
  /** Emoji → who reacted with it, so the UI can show counts and my own state. */
  reactions: Record<string, string[]>;
  commentCount: number;
}

export function useFeed(crewId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.feed(crewId ?? 'none'),
    enabled: Boolean(crewId),
    queryFn: async (): Promise<FeedEntry[]> => {
      const { data, error } = await supabase
        .from('feed_items')
        .select(
          '*, actor:profiles(*), reactions(emoji, profile_id), feed_comments(id)',
        )
        .eq('crew_id', crewId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;

      return (
        (data ?? []) as unknown as Array<
          FeedItemRow & {
            actor: ProfileRow | null;
            reactions: Array<{ emoji: string; profile_id: string }>;
            feed_comments: Array<{ id: string }>;
          }
        >
      ).map((row) => {
        const reactions: Record<string, string[]> = {};
        for (const reaction of row.reactions ?? []) {
          (reactions[reaction.emoji] ??= []).push(reaction.profile_id);
        }
        return {
          ...row,
          reactions,
          commentCount: (row.feed_comments ?? []).length,
        };
      });
    },
  });
}

/**
 * The Social tab: one feed across every crew you belong to.
 *
 * No new table and no new read surface — feed_items is already RLS-scoped to
 * your crews, so querying it without a crew filter *is* the cross-crew feed.
 * Each entry carries its crew's name so a person in three crews can tell which
 * group a round belongs to.
 */
export interface SocialFeedEntry extends FeedEntry {
  crewName: string;
}

export function useSocialFeed(enabled: boolean) {
  return useQuery({
    queryKey: ['social-feed'],
    enabled,
    staleTime: 1000 * 60,
    queryFn: async (): Promise<SocialFeedEntry[]> => {
      const { data, error } = await supabase
        .from('feed_items')
        .select(
          '*, actor:profiles(*), crews(name), reactions(emoji, profile_id), feed_comments(id)',
        )
        .order('created_at', { ascending: false })
        .limit(80);
      if (error) throw error;

      return (
        (data ?? []) as unknown as Array<
          FeedItemRow & {
            actor: ProfileRow | null;
            crews: { name: string } | null;
            reactions: Array<{ emoji: string; profile_id: string }>;
            feed_comments: Array<{ id: string }>;
          }
        >
      ).map((row) => {
        const reactions: Record<string, string[]> = {};
        for (const reaction of row.reactions ?? []) {
          (reactions[reaction.emoji] ??= []).push(reaction.profile_id);
        }
        return {
          ...row,
          crewName: row.crews?.name ?? 'a crew',
          reactions,
          commentCount: (row.feed_comments ?? []).length,
        };
      });
    },
  });
}

/**
 * Toggling, not adding. The primary key is (item, profile, emoji), so a plain
 * upsert made a reaction permanent — you could add a laugh and never take it
 * back, which is not how any feed anyone has used behaves.
 */
export function useReact(crewId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      feedItemId,
      profileId,
      emoji,
      on,
    }: {
      feedItemId: string;
      profileId: string;
      emoji: string;
      on: boolean;
    }) => {
      if (on) {
        const { error } = await supabase
          .from('reactions')
          .upsert({ feed_item_id: feedItemId, profile_id: profileId, emoji });
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from('reactions')
        .delete()
        .eq('feed_item_id', feedItemId)
        .eq('profile_id', profileId)
        .eq('emoji', emoji);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.feed(crewId) }),
  });
}

export interface FeedComment {
  id: string;
  body: string;
  createdAt: string | null;
  authorName: string;
  authorId: string;
}

export function useComments(feedItemId: string | undefined) {
  return useQuery({
    queryKey: ['feed-comments', feedItemId ?? 'none'],
    enabled: Boolean(feedItemId),
    queryFn: async (): Promise<FeedComment[]> => {
      const { data, error } = await supabase
        .from('feed_comments')
        .select('id, body, created_at, profile_id, profiles(display_name)')
        .eq('feed_item_id', feedItemId!)
        .order('created_at');
      if (error) throw error;
      return (
        (data ?? []) as unknown as Array<{
          id: string;
          body: string;
          created_at: string | null;
          profile_id: string;
          profiles: { display_name: string } | null;
        }>
      ).map((row) => ({
        id: row.id,
        body: row.body,
        createdAt: row.created_at,
        authorName: row.profiles?.display_name ?? 'Someone',
        authorId: row.profile_id,
      }));
    },
  });
}

export function useAddComment(crewId: string, feedItemId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ profileId, body }: { profileId: string; body: string }) => {
      const trimmed = body.trim();
      if (trimmed.length === 0) return;
      const { error } = await supabase
        .from('feed_comments')
        .insert({ feed_item_id: feedItemId, profile_id: profileId, body: trimmed });
      if (error) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['feed-comments', feedItemId] });
      void client.invalidateQueries({ queryKey: queryKeys.feed(crewId) });
    },
  });
}

/** Your own only — the policy enforces it, this just does not offer the rest. */
export function useDeleteComment(feedItemId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase.from('feed_comments').delete().eq('id', commentId);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['feed-comments', feedItemId] }),
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
