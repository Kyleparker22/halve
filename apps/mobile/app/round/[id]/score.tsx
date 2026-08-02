import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { WolfConfig } from '@halve/games';
import { WolfPicker } from '../../../src/components/WolfPicker';
import {
  Body,
  Button,
  Card,
  Divider,
  ErrorNote,
  Heading,
  Loading,
  Money,
  Row,
  Small,
} from '../../../src/components/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoundBundle } from '../../../src/hooks/useRounds';
import { useScorecard } from '../../../src/hooks/useScorecard';
import { HIT_SIZE, radius, spacing, useTheme } from '../../../src/theme';

export default function ScoreScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const bundle = useRoundBundle(id);
  const card = useScorecard(bundle.data);
  const [holeIndex, setHoleIndex] = useState(0);
  const [detailed, setDetailed] = useState(false);

  const holes = bundle.data?.holes ?? [];
  const hole = holes[Math.min(holeIndex, Math.max(0, holes.length - 1))];

  const players = useMemo(
    () => (bundle.data?.roster ?? []).filter((p) => p.rsvp === 'in'),
    [bundle.data?.roster],
  );

  if (bundle.isLoading) return <Loading label="Loading the card…" />;
  if (bundle.error) return <ErrorNote error={bundle.error} />;
  if (!bundle.data || !hole) return <ErrorNote error={new Error('This round has no hole data.')} />;

  const totalFor = (roundPlayerId: string) =>
    card.totals.find((t) => t.roundPlayerId === roundPlayerId);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Row justify="space-between">
          <View>
            <Heading>
              Hole {hole.number} · par {hole.par}
            </Heading>
            <Small>
              SI {hole.strokeIndex}
              {hole.yardage ? ` · ${hole.yardage} yds` : ''} · {bundle.data.courseName}
            </Small>
          </View>
          <Pressable onPress={() => router.push(`/round/${id}/card`)} accessibilityRole="button">
            <Small>Full card</Small>
          </Pressable>
        </Row>

        {card.lastConflict ? (
          <Pressable onPress={card.dismissConflict}>
            <Card style={{ borderColor: theme.flag }}>
              <Small>
                Hole {card.lastConflict.hole} was updated by someone else — showing theirs. Tap to
                dismiss.
              </Small>
            </Card>
          </Pressable>
        ) : null}

        {players.map((player) => {
          const entry = card.entry(player.id, hole.number);
          const totals = totalFor(player.id);
          const value = entry.strokes ?? hole.par;
          return (
            <Card key={player.id}>
              <Row justify="space-between">
                <View style={{ flex: 1 }}>
                  <Row gap={6}>
                    <Body>{player.name}</Body>
                    {player.isGuest ? <Small>guest</Small> : null}
                    {entry.pending ? <Small>·  syncing</Small> : null}
                  </Row>
                  <Small>
                    {totals && totals.holesPlayed > 0
                      ? `${totals.gross} gross · ${totals.net} net · ${
                          totals.toPar === 0 ? 'E' : totals.toPar > 0 ? `+${totals.toPar}` : totals.toPar
                        } thru ${totals.holesPlayed}`
                      : 'no scores yet'}
                  </Small>
                </View>

                <Row gap={spacing.sm}>
                  <Stepper
                    label="−"
                    onPress={() =>
                      card.enter(player.id, hole.number, { strokes: Math.max(1, value - 1) })
                    }
                  />
                  <View style={{ minWidth: 48, alignItems: 'center' }}>
                    <Text style={{ fontSize: 30, fontWeight: '700', color: theme.text }}>
                      {entry.strokes ?? '–'}
                    </Text>
                  </View>
                  <Stepper
                    label="+"
                    onPress={() =>
                      card.enter(player.id, hole.number, { strokes: Math.min(20, value + 1) })
                    }
                  />
                </Row>
              </Row>

              {detailed ? (
                <>
                  <Divider />
                  <Row justify="space-between">
                    <Small>Putts</Small>
                    <Row gap={spacing.sm}>
                      <Stepper
                        label="−"
                        small
                        onPress={() =>
                          card.enter(player.id, hole.number, {
                            putts: Math.max(0, (entry.putts ?? 2) - 1),
                          })
                        }
                      />
                      <Body>{entry.putts ?? '–'}</Body>
                      <Stepper
                        label="+"
                        small
                        onPress={() =>
                          card.enter(player.id, hole.number, { putts: (entry.putts ?? 0) + 1 })
                        }
                      />
                    </Row>
                    <Small>Penalties</Small>
                    <Row gap={spacing.sm}>
                      <Stepper
                        label="−"
                        small
                        onPress={() =>
                          card.enter(player.id, hole.number, {
                            penalties: Math.max(0, (entry.penalties ?? 0) - 1),
                          })
                        }
                      />
                      <Body>{entry.penalties ?? '–'}</Body>
                      <Stepper
                        label="+"
                        small
                        onPress={() =>
                          card.enter(player.id, hole.number, {
                            penalties: (entry.penalties ?? 0) + 1,
                          })
                        }
                      />
                    </Row>
                  </Row>
                </>
              ) : null}
            </Card>
          );
        })}

        <Pressable onPress={() => setDetailed((d) => !d)} accessibilityRole="switch">
          <Small>{detailed ? 'Hide putts and penalties' : 'Track putts and penalties'}</Small>
        </Pressable>

        {bundle.data.games
          .filter((game) => game.config.type === 'wolf')
          .map((game) => (
            <WolfPicker
              key={game.id}
              roundId={id}
              gameId={game.id}
              config={game.config as WolfConfig}
              roster={players}
              hole={hole.number}
            />
          ))}

        {card.moneyLine.length > 0 ? (
          <Card>
            <Heading>Money</Heading>
            {card.moneyLine.map((line) => (
              <View key={line.gameId} style={{ gap: spacing.xs }}>
                <Row justify="space-between">
                  <Small>{line.label}</Small>
                  {!line.result.isComplete ? <Small>in progress</Small> : null}
                </Row>
                {line.result.perPlayer.map((entry) => {
                  const player = players.find((p) => p.id === entry.roundPlayerId);
                  if (!player) return null;
                  return (
                    <Row key={entry.roundPlayerId} justify="space-between">
                      <Body>{player.name}</Body>
                      <Money cents={entry.amountCents} />
                    </Row>
                  );
                })}
              </View>
            ))}
            <Pressable onPress={() => router.push(`/round/${id}/recap`)}>
              <Small>Why do I owe that? →</Small>
            </Pressable>
          </Card>
        ) : (
          <Pressable onPress={() => router.push(`/round/${id}/games`)}>
            <Small>No games on this round yet — add one</Small>
          </Pressable>
        )}
      </ScrollView>

      {/* Primary targets in the bottom third: the user is holding a wedge. */}
      <Row justify="space-between" gap={spacing.md}>
        <View style={{ flex: 1, paddingLeft: spacing.lg, paddingBottom: spacing.md }}>
          <Button
            title="◀ Prev"
            variant="secondary"
            disabled={holeIndex === 0}
            onPress={() => setHoleIndex((i) => Math.max(0, i - 1))}
          />
        </View>
        <View style={{ flex: 1, paddingRight: spacing.lg, paddingBottom: spacing.md }}>
          {holeIndex >= holes.length - 1 ? (
            <Button title="Finish" onPress={() => router.push(`/round/${id}/recap`)} />
          ) : (
            <Button title="Next ▶" onPress={() => setHoleIndex((i) => Math.min(holes.length - 1, i + 1))} />
          )}
        </View>
      </Row>
      <Small style={{ textAlign: 'center', paddingBottom: spacing.sm }}>
        {card.pending > 0
          ? `${card.pending} ${card.pending === 1 ? 'entry' : 'entries'} waiting to sync`
          : card.online
            ? 'All scores synced'
            : 'Offline — every entry is saved on this phone'}
      </Small>
    </SafeAreaView>
  );
}

function Stepper({
  label,
  onPress,
  small,
}: {
  label: string;
  onPress: () => void;
  small?: boolean;
}) {
  const theme = useTheme();
  const size = small ? 34 : HIT_SIZE;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'increase' : 'decrease'}
      onPress={onPress}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? theme.accent : theme.border,
      })}
    >
      <Text style={{ fontSize: small ? 18 : 24, fontWeight: '700', color: theme.text }}>
        {label}
      </Text>
    </Pressable>
  );
}
