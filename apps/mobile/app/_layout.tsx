import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { CACHE_BUSTER, persister, queryClient } from '../src/lib/query';
import { startSyncEngine } from '../src/lib/sync';
import { identify, initTelemetry, withTelemetry } from '../src/lib/analytics';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { registerDevice, useNotificationRouting } from '../src/lib/notifications';
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

  // Only once there is a session to route into — pushing a round screen over
  // the sign-in gate would be undone by the redirect below a frame later.
  useNotificationRouting(!loading && !profileLoading && !!session);

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
          // Without this the back button inherits the previous route's title,
          // which for the tab group is the literal string "(tabs)".
          headerBackTitle: 'Back',
        }}
      >
        {/* Without an explicit title expo-router shows the raw route path. */}
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="crew/new" options={{ title: 'New crew' }} />
        <Stack.Screen name="crew/[id]/index" options={{ title: 'Crew' }} />
        <Stack.Screen name="crew/[id]/ledger" options={{ title: 'Ledger' }} />
        <Stack.Screen name="crew/[id]/season" options={{ title: 'Season' }} />
        <Stack.Screen name="crew/[id]/feed" options={{ title: 'Activity' }} />
        <Stack.Screen name="crew/[id]/settle" options={{ title: 'Settle up' }} />
        <Stack.Screen name="crew/[id]/guests" options={{ title: 'Guests' }} />
        <Stack.Screen name="course/new" options={{ title: 'Add a course' }} />
        <Stack.Screen name="course/[id]/index" options={{ title: 'Course' }} />
        <Stack.Screen name="course/[id]/card" options={{ title: 'Fix the card' }} />
        <Stack.Screen name="round/new" options={{ title: 'Schedule a round' }} />
        <Stack.Screen name="round/[id]/index" options={{ title: 'Round' }} />
        <Stack.Screen name="round/[id]/score" options={{ title: 'Scorecard' }} />
        <Stack.Screen name="round/[id]/card" options={{ title: 'Full card' }} />
        <Stack.Screen name="round/[id]/roster" options={{ title: 'Roster' }} />
        <Stack.Screen name="round/[id]/games" options={{ title: 'Games' }} />
        <Stack.Screen name="round/[id]/recap" options={{ title: 'Recap' }} />
        <Stack.Screen name="trip/new" options={{ title: 'New trip' }} />
        <Stack.Screen name="trip/[id]/index" options={{ title: 'Trip' }} />
        <Stack.Screen name="trip/[id]/expenses" options={{ title: 'Expenses' }} />
        <Stack.Screen name="trip/[id]/rooms" options={{ title: 'Rooms' }} />
        <Stack.Screen name="trip/[id]/pairings" options={{ title: 'Pairings' }} />
        <Stack.Screen name="trip/[id]/settle" options={{ title: 'Trip money' }} />
        <Stack.Screen name="trip/[id]/recap" options={{ title: 'Trip recap' }} />
        <Stack.Screen name="chat/[scope]/[id]" options={{ title: 'Chat' }} />
        <Stack.Screen name="settings/notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="seats" options={{ title: 'Open seats' }} />
        <Stack.Screen name="join/[code]" options={{ title: 'Join' }} />
      </Stack>
    </>
  );
}

function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{ persister, buster: CACHE_BUSTER }}
          >
            <RootNavigator />
          </PersistQueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap adds the native error handler and navigation instrumentation.
// It is a no-op when no DSN is configured, so this is safe before setup.
export default withTelemetry(RootLayout);
