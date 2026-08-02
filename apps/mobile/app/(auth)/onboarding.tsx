import { useEffect, useState } from 'react';
import { TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button, Card, Heading, Screen, Small, Title } from '../../src/components/ui';
import {
  useHandleAvailable,
  useProfile,
  useSession,
  useUpdateProfile,
} from '../../src/hooks/useSession';
import { radius, spacing, useTheme } from '../../src/theme';

export default function Onboarding() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const profileId = session?.user.id;
  const { data: profile } = useProfile(profileId);
  const update = useUpdateProfile(profileId);

  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [index, setIndex] = useState('');

  useEffect(() => {
    if (!profile) return;
    setDisplayName((current) => current || profile.display_name);
    setHandle((current) => current || profile.handle);
  }, [profile]);

  const normalized = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const { data: available, isFetching } = useHandleAvailable(normalized);
  const unchanged = normalized === profile?.handle;
  const valid = /^[a-z0-9_]{3,20}$/.test(normalized) && (unchanged || available === true);

  const input = {
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
    color: theme.text,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 48,
    fontSize: 17,
  };

  return (
    <Screen>
      <Title>Set up your profile</Title>

      <Card>
        <Heading>Name</Heading>
        <TextInput
          style={input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Kyle Parker"
          placeholderTextColor={theme.muted}
        />
      </Card>

      <Card>
        <Heading>Handle</Heading>
        <TextInput
          style={input}
          value={normalized}
          onChangeText={setHandle}
          autoCapitalize="none"
          placeholder="kyle"
          placeholderTextColor={theme.muted}
        />
        {normalized.length < 3 ? (
          <Small>3–20 characters, letters, numbers and underscores.</Small>
        ) : unchanged ? (
          <Small>This is your handle.</Small>
        ) : isFetching ? (
          <Small>Checking…</Small>
        ) : available ? (
          <Small>@{normalized} is free.</Small>
        ) : (
          <Small>@{normalized} is taken — try another.</Small>
        )}
      </Card>

      <Card>
        <Heading>Handicap index</Heading>
        <TextInput
          style={input}
          value={index}
          onChangeText={setIndex}
          keyboardType="numbers-and-punctuation"
          placeholder="8.4"
          placeholderTextColor={theme.muted}
        />
        <Body muted>Self-reported and unofficial. Used to work out strokes in your games.</Body>
      </Card>

      <Button
        title="Start playing"
        disabled={!valid || displayName.trim().length === 0}
        loading={update.isPending}
        onPress={() =>
          update.mutate(
            {
              display_name: displayName.trim(),
              handle: normalized,
              handicap_index: index.trim() === '' ? null : Number(index),
              handicap_source: 'self',
            },
            { onSuccess: () => router.replace('/(tabs)') },
          )
        }
      />
      {update.error ? <Small>{(update.error as Error).message}</Small> : null}
    </Screen>
  );
}
