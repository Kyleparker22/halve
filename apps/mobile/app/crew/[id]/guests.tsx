import { useState } from 'react';
import { Pressable, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Body,
  Button,
  Card,
  ErrorNote,
  Heading,
  Loading,
  Row,
  Screen,
  Small,
  Title,
} from '../../../src/components/ui';
import { useAddGuest, useCrewGuests, useCrewMembers } from '../../../src/hooks/useCrews';
import { useSession } from '../../../src/hooks/useSession';
import { radius, spacing, useTheme } from '../../../src/theme';

/**
 * Guests are crew-scoped and persistent, not per-round, so a recurring guest
 * keeps continuity across rounds, trips and the season ledger. Every guest
 * carries a voucher — the member whose money theirs resolves to.
 */
export default function GuestsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { session } = useSession();
  const guests = useCrewGuests(id);
  const members = useCrewMembers(id);
  const addGuest = useAddGuest(id);

  const [name, setName] = useState('');
  const [vouchedBy, setVouchedBy] = useState<string | null>(session?.user.id ?? null);

  if (guests.isLoading) return <Loading />;
  if (guests.error) return <ErrorNote error={guests.error} />;

  const nameFor = (profileId: string) =>
    members.data?.find((m) => m.profileId === profileId)?.profile.display_name ?? 'Someone';

  const input = {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.md,
    color: theme.text,
    padding: spacing.md,
    minHeight: 48,
    fontSize: 17,
  };

  return (
    <Screen>
      <Title>Guests</Title>
      <Small>
        Someone who plays with you but has no account. They can be scored, join games and appear in
        the ledger — their balance sits with whoever vouched for them.
      </Small>

      <Card>
        <Heading>In this crew</Heading>
        {(guests.data ?? []).length === 0 ? (
          <Small>No guests yet.</Small>
        ) : (
          (guests.data ?? []).map((guest) => (
            <Row key={guest.id} justify="space-between">
              <Body>{guest.name}</Body>
              <Small>vouched by {nameFor(guest.vouched_by)}</Small>
            </Row>
          ))
        )}
      </Card>

      <Card>
        <Heading>Add a guest</Heading>
        <TextInput
          style={input}
          testID="guest-name"
          value={name}
          onChangeText={setName}
          placeholder="Big Dave"
          placeholderTextColor={theme.muted}
        />
        <Small>Vouched by — whoever settles up for them</Small>
        <Row wrap gap={spacing.sm}>
          {(members.data ?? []).map((member) => (
            <Pressable key={member.profileId} onPress={() => setVouchedBy(member.profileId)}>
              <Body
                style={{ color: vouchedBy === member.profileId ? theme.accent : theme.text }}
              >
                {member.profile.display_name}
              </Body>
            </Pressable>
          ))}
        </Row>
        <Button
          title="Add guest"
          disabled={name.trim().length === 0 || !vouchedBy}
          loading={addGuest.isPending}
          onPress={() =>
            addGuest.mutate(
              { name: name.trim(), vouchedBy: vouchedBy! },
              { onSuccess: () => setName('') },
            )
          }
        />
        {addGuest.error ? <Small>{(addGuest.error as Error).message}</Small> : null}
      </Card>

      <Button title="Done" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
