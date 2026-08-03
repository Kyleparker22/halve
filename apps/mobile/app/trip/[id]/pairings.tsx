import { useState } from 'react';
import { Pressable } from 'react-native';
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
import { useGeneratePairings, useSetPlayerGroup, useTrip } from '../../../src/hooks/useTrips';
import { spacing, useTheme } from '../../../src/theme';

export default function PairingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const trip = useTrip(id);
  const generate = useGeneratePairings(id);
  const setGroup = useSetPlayerGroup(id);
  const [moving, setMoving] = useState<string | null>(null);

  if (trip.isLoading) return <Loading />;
  if (trip.error) return <ErrorNote error={trip.error} />;
  if (!trip.data) return null;

  const { rounds, pairingsByRound, members } = trip.data;
  const going = members.filter((m) => m.status === 'in');

  return (
    <Screen>
      <Title>Pairings</Title>
      <Small>
        Groups that avoid repeating a partner until they have to. Generated once and then yours to
        change — moving someone sticks.
      </Small>

      {generate.error ? <ErrorNote error={generate.error} /> : null}

      <Button
        title={
          Object.keys(pairingsByRound).length === 0 ? 'Generate pairings' : 'Generate them again'
        }
        loading={generate.isPending}
        disabled={going.length < 2 || rounds.length === 0}
        onPress={() => generate.mutate({})}
      />
      {going.length < 2 || rounds.length === 0 ? (
        <Small>
          {rounds.length === 0
            ? 'Add a round to the itinerary first.'
            : 'At least two people need to be in.'}
        </Small>
      ) : (
        <Small>
          Rounds already played are left alone — regenerating will not reshuffle a card people have
          already filled in.
        </Small>
      )}

      {rounds.map((round, index) => {
        const players = pairingsByRound[round.id] ?? [];
        const groups = new Map<number, typeof players>();
        const ungrouped: typeof players = [];
        for (const player of players) {
          if (player.groupNumber === null) ungrouped.push(player);
          else groups.set(player.groupNumber, [...(groups.get(player.groupNumber) ?? []), player]);
        }
        const groupNumbers = [...groups.keys()].sort((a, b) => a - b);
        // Always offer one more group than exists, so someone can be moved out
        // of a crowded foursome into a new one.
        const targets = [...groupNumbers, (groupNumbers[groupNumbers.length - 1] ?? 0) + 1];

        return (
          <Card key={round.id}>
            <Row justify="space-between">
              <Heading>
                Day {index + 1} · {new Date(round.scheduled_at).toLocaleDateString()}
              </Heading>
              <Small>{round.status}</Small>
            </Row>

            {players.length === 0 ? <Small>Nobody assigned yet.</Small> : null}

            {groupNumbers.map((groupNumber) => (
              <Card key={groupNumber}>
                <Small>Group {groupNumber}</Small>
                {(groups.get(groupNumber) ?? []).map((player) => (
                  <Row key={player.roundPlayerId} justify="space-between">
                    <Body>{player.name}</Body>
                    <Button
                      title={moving === player.roundPlayerId ? 'Move to…' : 'Move'}
                      variant="secondary"
                      onPress={() =>
                        setMoving(moving === player.roundPlayerId ? null : player.roundPlayerId)
                      }
                    />
                  </Row>
                ))}
              </Card>
            ))}

            {ungrouped.length > 0 ? (
              <Card>
                <Small>No group</Small>
                {ungrouped.map((player) => (
                  <Row key={player.roundPlayerId} justify="space-between">
                    <Body>{player.name}</Body>
                    <Button
                      title="Move"
                      variant="secondary"
                      onPress={() =>
                        setMoving(moving === player.roundPlayerId ? null : player.roundPlayerId)
                      }
                    />
                  </Row>
                ))}
              </Card>
            ) : null}

            {moving && players.some((p) => p.roundPlayerId === moving) ? (
              <Row wrap gap={spacing.sm}>
                {targets.map((target) => (
                  <Pressable
                    key={target}
                    onPress={() => {
                      setGroup.mutate({ roundPlayerId: moving, groupNumber: target });
                      setMoving(null);
                    }}
                  >
                    <Body style={{ color: theme.accent }}>Group {target}</Body>
                  </Pressable>
                ))}
              </Row>
            ) : null}
          </Card>
        );
      })}

      {setGroup.error ? <ErrorNote error={setGroup.error} /> : null}
    </Screen>
  );
}
