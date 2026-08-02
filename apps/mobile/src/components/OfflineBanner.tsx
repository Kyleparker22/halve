import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isOnline, onSyncEvent } from '../lib/sync';
import { spacing, useTheme } from '../theme';

/**
 * Subtle, never blocking. "Offline — scores saved" is reassurance, not an error;
 * a modal here would be the fastest way to send the crew back to a paper card.
 */
export function OfflineBanner() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [online, setOnline] = useState(isOnline());
  const [pending, setPending] = useState(0);

  useEffect(
    () =>
      onSyncEvent((event) => {
        if (event.type === 'online') setOnline(event.online);
        if (event.type === 'flushed') setPending(event.pending);
      }),
    [],
  );

  if (online && pending === 0) return null;

  return (
    <View
      style={{
        paddingTop: insets.top,
        backgroundColor: online ? theme.accent : theme.flag,
        paddingBottom: spacing.xs,
        paddingHorizontal: spacing.lg,
      }}
    >
      <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>
        {online
          ? `Syncing ${pending} ${pending === 1 ? 'entry' : 'entries'}…`
          : 'Offline — scores saved'}
      </Text>
    </View>
  );
}
