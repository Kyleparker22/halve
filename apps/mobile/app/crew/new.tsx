import { useState } from 'react';
import { TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Heading, Screen, Small, Title } from '../../src/components/ui';
import { useCreateCrew, useJoinCrew } from '../../src/hooks/useCrews';
import { useSession } from '../../src/hooks/useSession';
import { radius, spacing, useTheme } from '../../src/theme';

export default function NewCrewScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const create = useCreateCrew();
  const join = useJoinCrew();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

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
      <Title>New crew</Title>

      <Card>
        <Heading>Start one</Heading>
        <TextInput
          style={input}
          testID="crew-name"
          value={name}
          onChangeText={setName}
          placeholder="Saturday Regulars"
          placeholderTextColor={theme.muted}
        />
        <Button
          title="Create crew"
          disabled={name.trim().length === 0}
          loading={create.isPending}
          onPress={() =>
            create.mutate(
              { name: name.trim(), profileId: session!.user.id },
              { onSuccess: (crew) => router.replace(`/crew/${crew.id}`) },
            )
          }
        />
        {create.error ? <Small>{(create.error as Error).message}</Small> : null}
      </Card>

      <Card>
        <Heading>Or join with a code</Heading>
        <TextInput
          style={input}
          testID="join-code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          placeholder="sat4some01"
          placeholderTextColor={theme.muted}
        />
        <Button
          title="Join"
          variant="secondary"
          disabled={code.trim().length < 4}
          loading={join.isPending}
          onPress={() =>
            join.mutate(code.trim(), { onSuccess: (crewId) => router.replace(`/crew/${crewId}`) })
          }
        />
        {join.error ? <Small>{(join.error as Error).message}</Small> : null}
      </Card>
    </Screen>
  );
}
