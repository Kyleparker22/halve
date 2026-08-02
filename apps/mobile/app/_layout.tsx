import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { persister, queryClient } from '../src/lib/query';
import { startSyncEngine } from '../src/lib/sync';
import { identify, initTelemetry } from '../src/lib/analytics';
import { registerDevice } from '../src/lib/notifications';
import { useProfile, useSession } from '../src/hooks/useSession';
import { useTheme } from '../src/theme';
import { Loading } from '../src/components/ui';
import { OfflineBanner } from '../src/components/OfflineBanner';

initTelemetry();

function RootNavigator() {
  const theme = useTheme();
  const { session, loading } = useSession();
  const { data: profile, isLoading: profileLoading } = useProfile(session?.user.id);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => startSyncEngine(), []);

  useEffect(() => {
    if (!session?.user.id) return;
    identify(session.user.id);
    void registerDevice(session.user.id);
  }, [session?.user.id]);

  useEffect(() => {
    if (loading || (session && profileLoading)) return;
    const inAuth = segments[0] === '(auth)';

    if (!session && !inAuth) {
      router.replace('/(auth)/sign-in');
      return;
    }
    // A signed-in user with no handle has not finished onboarding.
    if (session && profile && !profile.handle.startsWith('deleted_') && inAuth) {
      router.replace('/(tabs)');
    }
  }, [loading, profile, profileLoading, router, segments, session]);

  if (loading) return <Loading label="Getting your crew…" />;

  return (
    <>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <OfflineBanner />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.bg },
          headerTintColor: theme.text,
          headerTitleStyle: { color: theme.text },
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="round/[id]/score" options={{ title: 'Scorecard' }} />
        <Stack.Screen name="join/[code]" options={{ title: 'Join' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
          <RootNavigator />
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
