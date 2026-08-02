import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProfileRow } from '@halve/types';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/query';

export function useSession(): { session: Session | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}

export function useProfile(profileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.profile(profileId ?? 'none'),
    enabled: Boolean(profileId),
    queryFn: async (): Promise<ProfileRow | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', profileId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSignInWithOtp() {
  return useMutation({
    mutationFn: async (phone: string) => {
      const { error } = await supabase.auth.signInWithOtp({ phone });
      if (error) throw error;
    },
  });
}

export function useVerifyOtp() {
  return useMutation({
    mutationFn: async ({ phone, token }: { phone: string; token: string }) => {
      const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
      if (error) throw error;
    },
  });
}

export function useSignInWithProvider() {
  return useMutation({
    mutationFn: async (provider: 'apple' | 'google') => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: 'halve://auth-callback', skipBrowserRedirect: false },
      });
      if (error) throw error;
    },
  });
}

export function useUpdateProfile(profileId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<ProfileRow>) => {
      if (!profileId) throw new Error('not signed in');
      const { error } = await supabase.from('profiles').update(patch).eq('id', profileId);
      if (error) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.profile(profileId ?? 'none') });
    },
  });
}

export function useHandleAvailable(handle: string) {
  return useQuery({
    queryKey: ['handle', handle],
    enabled: handle.length >= 3,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('handle', handle.toLowerCase());
      if (error) throw error;
      return (count ?? 0) === 0;
    },
  });
}

export function useSignOut() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    onSuccess: () => client.clear(),
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('delete_account', {});
      if (error) throw error;
      await supabase.auth.signOut();
    },
  });
}
