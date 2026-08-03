import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useRouter, type Href } from 'expo-router';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * One row per device, not one column per profile — a user with an iPad and a
 * reinstall would otherwise silently lose pushes.
 */
export async function registerDevice(profileId: string): Promise<void> {
  if (!Device.isDevice) return;

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);

  await supabase.from('devices').upsert(
    {
      profile_id: profileId,
      push_token: token.data,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'push_token' },
  );
}

/**
 * Where a notification goes when it is tapped. Every payload carries the id of
 * the thing it is about; a notification that opens the app to whatever screen
 * it was last on is barely a notification at all.
 */
export function routeForNotification(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const id = (key: string) => (typeof data[key] === 'string' ? (data[key] as string) : null);

  const round = id('round_id');
  if (round) return `/round/${round}`;
  // A settlement lives on the crew's settle-up sheet, not a screen of its own.
  const crew = id('crew_id');
  if (crew) return id('settlement_id') ? `/crew/${crew}/settle` : `/crew/${crew}`;
  const trip = id('trip_id');
  if (trip) return `/trip/${trip}`;
  return null;
}

/**
 * Handles both cases, which are genuinely different: a tap while the app is
 * running, and a tap that cold-starts it from a killed state. The second is the
 * common one — the whole point is reaching someone who is not in the app — and
 * an event listener alone misses it, because the response is delivered before
 * React mounts. useLastNotificationResponse replays it.
 */
export function useNotificationRouting(ready: boolean): void {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !response) return;
    // Identity, not existence: the hook holds the last response indefinitely,
    // so without this a later re-render would navigate all over again.
    const id = response.notification.request.identifier;
    if (handled.current === id) return;

    const target = routeForNotification(
      response.notification.request.content.data as Record<string, unknown> | undefined,
    );
    if (!target) return;
    handled.current = id;
    // Built from ids at runtime, so it cannot satisfy the generated route union.
    router.push(target as Href);
  }, [ready, response, router]);
}
