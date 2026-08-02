import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
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
