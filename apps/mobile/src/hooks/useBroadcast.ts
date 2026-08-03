import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface Storyline {
  id: string;
  body: string;
  subjectPlayerId: string;
  submittedBy: string;
  createdAt: string | null;
}

/**
 * The dirt. This is the input that makes the booth funny — everything else it
 * says comes from the scorecard, which knows what happened but not why.
 *
 * Returns only what you submitted. Everyone else's is invisible until Marcy
 * says it out loud, which is both the joke and the reason people write
 * honestly — a storyline with your name on it is a very different thing to
 * write than one nobody can trace.
 */
export function useStorylines(roundId: string | undefined) {
  return useQuery({
    queryKey: ['round', roundId ?? 'none', 'storylines'],
    enabled: Boolean(roundId),
    queryFn: async (): Promise<Storyline[]> => {
      const { data, error } = await supabase
        .from('round_storylines')
        .select('id, body, subject_player_id, submitted_by, created_at')
        .eq('round_id', roundId!)
        .order('created_at');
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        body: row.body,
        subjectPlayerId: row.subject_player_id,
        submittedBy: row.submitted_by,
        createdAt: row.created_at,
      }));
    },
  });
}

/** How many are loaded, without revealing any of them. */
export function useStorylineCount(roundId: string | undefined) {
  return useQuery({
    queryKey: ['round', roundId ?? 'none', 'storyline-count'],
    enabled: Boolean(roundId),
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('storyline_count', { p_round_id: roundId! });
      if (error) throw error;
      return (data as number) ?? 0;
    },
  });
}

export function useAddStoryline(roundId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      subjectPlayerId,
      body,
      submittedBy,
    }: {
      subjectPlayerId: string;
      body: string;
      submittedBy: string;
    }) => {
      const { error } = await supabase.from('round_storylines').insert({
        round_id: roundId,
        subject_player_id: subjectPlayerId,
        submitted_by: submittedBy,
        body: body.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['round', roundId, 'storylines'] });
      void client.invalidateQueries({ queryKey: ['round', roundId, 'storyline-count'] });
    },
  });
}

/** Your own only — the policy enforces it, this just does not offer the rest. */
export function useDeleteStoryline(roundId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('round_storylines').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['round', roundId, 'storylines'] }),
  });
}

export interface BroadcastSegment {
  id: string;
  holeNumber: number | null;
  script: Array<{ speaker: string; line: string }>;
  createdAt: string | null;
}

export function useBroadcastSegments(roundId: string | undefined) {
  return useQuery({
    queryKey: ['round', roundId ?? 'none', 'broadcast'],
    enabled: Boolean(roundId),
    // The booth is a live thing; a stale feed is worse than a slow one.
    refetchInterval: 30_000,
    queryFn: async (): Promise<BroadcastSegment[]> => {
      const { data, error } = await supabase
        .from('broadcast_segments')
        .select('id, hole_number, script, created_at')
        .eq('round_id', roundId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        holeNumber: row.hole_number,
        script: (row.script ?? []) as BroadcastSegment['script'],
        createdAt: row.created_at,
      }));
    },
  });
}

/**
 * Uploads a clip and asks the booth to call it.
 *
 * The upload and the call are one action from the golfer's side — filming
 * something and then separately asking for commentary is a step nobody would
 * take twice.
 */
export function useSubmitClip(roundId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      uri,
      kind,
      subjectPlayerId,
      holeNumber,
      caption,
      uploadedBy,
    }: {
      uri: string;
      kind: 'photo' | 'video';
      subjectPlayerId: string | null;
      holeNumber: number | null;
      caption?: string;
      uploadedBy: string;
    }) => {
      const response = await fetch(uri);
      const body = await response.arrayBuffer();
      const extension = uri.split('.').pop()?.toLowerCase().split('?')[0] ?? 'jpg';
      const path = `${roundId}/${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from('round-media')
        .upload(path, body, {
          contentType: response.headers.get('content-type') ?? undefined,
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data: media, error } = await supabase
        .from('round_media')
        .insert({
          round_id: roundId,
          subject_player_id: subjectPlayerId,
          hole_number: holeNumber,
          uploaded_by: uploadedBy,
          storage_path: path,
          kind,
          caption: caption?.trim() || null,
        })
        .select('id')
        .single();
      if (error) throw error;

      // Ask the booth to call it. A failure here is not a failed upload — the
      // clip is saved either way, and the segment can be retried.
      const { error: callError } = await supabase.functions.invoke('broadcast-call', {
        body: { round_id: roundId, media_id: media.id },
      });
      if (callError) return { mediaId: media.id, called: false };
      return { mediaId: media.id, called: true };
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['round', roundId, 'broadcast'] });
      void client.invalidateQueries({ queryKey: ['round', roundId, 'media'] });
    },
  });
}

/** A leaderboard update with no clip — "throw it back to the booth". */
export function useCallBooth(roundId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('broadcast-call', {
        body: { round_id: roundId },
      });
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['round', roundId, 'broadcast'] }),
  });
}
