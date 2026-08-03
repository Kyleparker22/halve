import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Body,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Heading,
  Loading,
  Row,
  Screen,
  Small,
  Title,
} from '../../../src/components/ui';
import {
  useBroadcastSegments,
  useCallBooth,
  useStorylines,
  useSubmitClip,
} from '../../../src/hooks/useBroadcast';
import { useRoundBundle } from '../../../src/hooks/useRounds';
import { useSession } from '../../../src/hooks/useSession';
import { radius, spacing, useTheme } from '../../../src/theme';

export default function BoothScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const bundle = useRoundBundle(id);
  const segments = useBroadcastSegments(id);
  const storylines = useStorylines(id);
  const submit = useSubmitClip(id);
  const call = useCallBooth(id);

  const [subject, setSubject] = useState<string | null>(null);
  const [hole, setHole] = useState('');
  const [caption, setCaption] = useState('');

  if (bundle.isLoading) return <Loading />;
  if (bundle.error) return <ErrorNote error={bundle.error} />;
  if (!bundle.data) return null;

  const { roster, courseName } = bundle.data;
  const me = session?.user.id;

  /**
   * One action, not two. Filming something and then separately asking for
   * commentary is a step nobody takes twice — the pick, the upload and the
   * call all happen behind this button.
   */
  const capture = async (from: 'camera' | 'library') => {
    const permission =
      from === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images', 'videos'],
      quality: 0.7,
      videoMaxDuration: 30,
    };
    const result =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets[0] || !me) return;

    const asset = result.assets[0];
    submit.mutate(
      {
        uri: asset.uri,
        kind: asset.type === 'video' ? 'video' : 'photo',
        subjectPlayerId: subject,
        holeNumber: hole ? Number(hole) : null,
        caption,
        uploadedBy: me,
      },
      { onSuccess: () => setCaption('') },
    );
  };

  return (
    <Screen>
      <Title>The booth</Title>
      <Small>
        Hal and Marcy calling {courseName}. Send them a clip and they will call it — they already
        know the scores.
      </Small>

      <Card>
        <Heading>Send them something</Heading>
        <Small>Who is it of?</Small>
        <Row wrap gap={spacing.sm}>
          {roster.map((player) => (
            <Pressable
              key={player.id}
              onPress={() => setSubject(subject === player.id ? null : player.id)}
            >
              <Body style={{ color: subject === player.id ? theme.accent : theme.muted }}>
                {player.name}
              </Body>
            </Pressable>
          ))}
        </Row>
        <Row gap={spacing.sm}>
          <TextInput
            style={{
              width: 80,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: radius.md,
              color: theme.text,
              padding: spacing.md,
              minHeight: 48,
            }}
            value={hole}
            onChangeText={setHole}
            keyboardType="number-pad"
            placeholder="Hole"
            placeholderTextColor={theme.muted}
          />
          <TextInput
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: radius.md,
              color: theme.text,
              padding: spacing.md,
              minHeight: 48,
            }}
            value={caption}
            onChangeText={setCaption}
            maxLength={280}
            placeholder="For birdie…"
            placeholderTextColor={theme.muted}
          />
        </Row>
        {submit.error ? <ErrorNote error={submit.error} /> : null}
        {submit.data && !submit.data.called ? (
          <Small>
            Clip saved, but the booth could not be reached. It will still be in the highlight reel.
          </Small>
        ) : null}
        <Row gap={spacing.sm}>
          <Button
            title={submit.isPending ? 'Sending…' : 'Film it'}
            disabled={submit.isPending || !me}
            onPress={() => void capture('camera')}
          />
          <Button
            title="From camera roll"
            variant="secondary"
            disabled={submit.isPending || !me}
            onPress={() => void capture('library')}
          />
        </Row>
      </Card>

      <Row justify="space-between">
        <Button
          title={call.isPending ? 'Going to the booth…' : 'Throw it back to the booth'}
          variant="secondary"
          disabled={call.isPending}
          onPress={() => call.mutate()}
        />
        <Button
          title={`Storylines${(storylines.data ?? []).length > 0 ? ` (${(storylines.data ?? []).length})` : ''}`}
          variant="secondary"
          onPress={() => router.push(`/round/${id}/storylines`)}
        />
      </Row>
      {call.error ? <ErrorNote error={call.error} /> : null}

      {(segments.data ?? []).length === 0 ? (
        <EmptyState
          title="Nothing called yet"
          hint="Send a clip, or throw it back to the booth for a leaderboard update. Give them storylines first and they will be a lot meaner."
          actions={[
            { label: 'Add storylines', onPress: () => router.push(`/round/${id}/storylines`) },
          ]}
        />
      ) : null}

      {(segments.data ?? []).map((segment) => (
        <Card key={segment.id}>
          <Row justify="space-between">
            <Small>
              {segment.holeNumber ? `Hole ${segment.holeNumber}` : 'From the booth'}
            </Small>
            <Small>
              {segment.createdAt
                ? new Date(segment.createdAt).toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                : ''}
            </Small>
          </Row>
          <View style={{ gap: spacing.sm }}>
            {segment.script.map((entry, index) => (
              <Body key={index}>
                <Body style={{ color: theme.accent }}>{entry.speaker}: </Body>
                {entry.line}
              </Body>
            ))}
          </View>
        </Card>
      ))}
    </Screen>
  );
}
