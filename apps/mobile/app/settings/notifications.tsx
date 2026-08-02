import { Pressable } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Body, Card, Loading, Row, Screen, Small, Title } from '../../src/components/ui';
import { useSession } from '../../src/hooks/useSession';
import { supabase } from '../../src/lib/supabase';
import type { NotificationKind } from '@halve/types';

/** Every notification type is individually mutable. Absence of a row means on. */
const KINDS: Array<{ kind: NotificationKind; label: string }> = [
  { kind: 'crew_invite', label: 'Invited to a crew' },
  { kind: 'round_invite', label: 'Invited to a round' },
  { kind: 'trip_invite', label: 'Invited to a trip' },
  { kind: 'rsvp_nudge', label: 'Nudge when I have not answered' },
  { kind: 'round_starting', label: 'Tee time in an hour' },
  { kind: 'seat_requested', label: 'Someone wants an open seat' },
  { kind: 'seat_approved', label: 'My seat request was approved' },
  { kind: 'scores_entered', label: 'Scores going in (batched)' },
  { kind: 'round_completed', label: 'Round finished and money computed' },
  { kind: 'settlement_requested', label: 'Someone asked me to settle' },
  { kind: 'settlement_confirmed', label: 'A settlement was confirmed' },
  { kind: 'trip_updated', label: 'Trip roster or rooms changed' },
  { kind: 'message', label: 'Chat messages' },
];

export default function NotificationSettings() {
  const { session } = useSession();
  const client = useQueryClient();
  const profileId = session?.user.id;

  const prefs = useQuery({
    queryKey: ['notification-prefs', profileId],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_prefs')
        .select('*')
        .eq('profile_id', profileId!);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ kind: string; enabled: boolean }>;
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ kind, enabled }: { kind: NotificationKind; enabled: boolean }) => {
      const { error } = await supabase
        .from('notification_prefs')
        .upsert({ profile_id: profileId!, kind, enabled });
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['notification-prefs', profileId] }),
  });

  if (prefs.isLoading) return <Loading />;

  const enabledFor = (kind: NotificationKind) =>
    prefs.data?.find((row) => row.kind === kind)?.enabled ?? true;

  return (
    <Screen>
      <Title>Notifications</Title>
      <Small>
        Score entries are batched — a crew of eight filling in a card sends one push, not eight.
      </Small>
      <Card>
        {KINDS.map((entry) => (
          <Pressable
            key={entry.kind}
            accessibilityRole="switch"
            onPress={() => toggle.mutate({ kind: entry.kind, enabled: !enabledFor(entry.kind) })}
          >
            <Row justify="space-between">
              <Body>{entry.label}</Body>
              <Body>{enabledFor(entry.kind) ? '☑' : '☐'}</Body>
            </Row>
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}
