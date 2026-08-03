import { useEffect, useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
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

/**
 * Native Sign in with Apple. The OAuth web redirect works, but on a native iOS
 * app it is the wrong shape: it bounces through a browser, needs a Services ID
 * and a redirect URL, and is not what App Review expects to see. The native
 * flow uses the app's own bundle identifier and hands Supabase an identity
 * token to verify directly.
 */
export function useSignInWithApple() {
  return useMutation({
    mutationFn: async () => {
      const available = await AppleAuthentication.isAvailableAsync();
      if (!available) throw new Error('Sign in with Apple is not available on this device.');

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('Apple did not return an identity token.');

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;

      // Apple sends the real name exactly once, on first authorisation, and
      // never again. Capture it now or the profile is stuck with a generated
      // handle forever.
      const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(' ')
        .trim();
      if (fullName && data.user) {
        await supabase
          .from('profiles')
          .update({ display_name: fullName })
          .eq('id', data.user.id)
          .is('display_name', null);
      }

      return data;
    },
  });
}

export function useSignInWithProvider() {
  return useMutation({
    mutationFn: async (provider: 'google') => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: 'halve://auth-callback', skipBrowserRedirect: false },
      });
      if (error) throw error;
    },
  });
}

/**
 * Development only. Apple needs a paid developer account, Google needs OAuth
 * credentials and phone OTP needs Twilio — none of which should stand between
 * a developer and a running app. Signs in if the account exists, creates it if
 * not. Gated behind __DEV__ at the call site so it cannot ship.
 */
export function useDevEmailSignIn() {
  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const signIn = await supabase.auth.signInWithPassword({ email, password });
      if (!signIn.error) return signIn.data;

      const signUp = await supabase.auth.signUp({ email, password });
      if (signUp.error) throw signUp.error;
      if (!signUp.data.session) {
        throw new Error(
          'Account created but no session — email confirmations are on for this project. ' +
            'Turn them off in Auth settings, or run `supabase config push`.',
        );
      }
      return signUp.data;
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
