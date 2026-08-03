import { useState } from 'react';
import { Pressable, TextInput } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
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
import {
  useAddStoryline,
  useDeleteStoryline,
  useStorylines,
} from '../../../src/hooks/useBroadcast';
import { useRoundBundle } from '../../../src/hooks/useRounds';
import { useSession } from '../../../src/hooks/useSession';
import { radius, spacing, useTheme } from '../../../src/theme';

export default function StorylinesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { session } = useSession();
  const bundle = useRoundBundle(id);
  const storylines = useStorylines(id);
  const add = useAddStoryline(id);
  const remove = useDeleteStoryline(id);

  const [subject, setSubject] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  if (bundle.isLoading) return <Loading />;
  if (bundle.error) return <ErrorNote error={bundle.error} />;
  if (!bundle.data) return null;

  const { roster } = bundle.data;
  const me = session?.user.id;
  const nameOf = (playerId: string) => roster.find((p) => p.id === playerId)?.name ?? 'Player';

  // You cannot submit dirt on yourself. That is not the game.
  const targets = roster.filter((p) => p.profileId !== me);

  return (
    <Screen>
      <Title>Storylines</Title>
      <Small>
        What the booth does not know. Scores tell them what happened — this tells them why. Submit
        before the round; everyone playing can see them.
      </Small>

      <Card>
        <Heading>Who is this about?</Heading>
        <Row wrap gap={spacing.sm}>
          {targets.map((player) => (
            <Pressable key={player.id} onPress={() => setSubject(player.id)}>
              <Body style={{ color: subject === player.id ? theme.accent : theme.text }}>
                {player.name}
              </Body>
            </Pressable>
          ))}
        </Row>
        {targets.length === 0 ? (
          <Small>Nobody else is on this round yet.</Small>
        ) : (
          <>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: radius.md,
                color: theme.text,
                padding: spacing.md,
                minHeight: 72,
              }}
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={280}
              placeholder="Was out until 2am. Says the new driver is going to change everything."
              placeholderTextColor={theme.muted}
            />
            <Small>{280 - draft.length} left</Small>
            {add.error ? <ErrorNote error={add.error} /> : null}
            <Button
              title="Give it to the booth"
              disabled={!subject || draft.trim().length === 0 || add.isPending || !me}
              onPress={() =>
                add.mutate(
                  { subjectPlayerId: subject!, body: draft, submittedBy: me! },
                  { onSuccess: () => setDraft('') },
                )
              }
            />
          </>
        )}
      </Card>

      <Card>
        <Heading>On the record</Heading>
        {(storylines.data ?? []).length === 0 ? (
          <Small>Nothing yet. The booth will have to work with the golf.</Small>
        ) : (
          (storylines.data ?? []).map((line) => (
            <Row key={line.id} justify="space-between">
              <Body>
                <Body style={{ color: theme.muted }}>{nameOf(line.subjectPlayerId)}: </Body>
                {line.body}
              </Body>
              {line.submittedBy === me ? (
                <Pressable onPress={() => remove.mutate(line.id)}>
                  <Small>delete</Small>
                </Pressable>
              ) : null}
            </Row>
          ))
        )}
      </Card>

      <Small>
        The booth is told never to go after anyone&apos;s body, marriage or money beyond the bet —
        and never to mention someone who is not playing. How hard it goes otherwise is a crew
        setting.
      </Small>
    </Screen>
  );
}
