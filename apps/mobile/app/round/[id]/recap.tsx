import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { partitionBreakdown } from '@halve/games';
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
  Screen,
  Small,
  Title,
} from '../../../src/components/ui';
import { useRoundBundle } from '../../../src/hooks/useRounds';
import { useScorecard } from '../../../src/hooks/useScorecard';
import { useCompleteRound } from '../../../src/hooks/useGames';
import { spacing } from '../../../src/theme';

export default function RecapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const bundle = useRoundBundle(id);
  const card = useScorecard(bundle.data);
  const complete = useCompleteRound(id);

  if (bundle.isLoading) return <Loading />;
  if (bundle.error) return <ErrorNote error={bundle.error} />;
  if (!bundle.data) return null;

  const { round, roster, courseName } = bundle.data;
  const playing = roster.filter((p) => p.rsvp === 'in');
  const names = Object.fromEntries(playing.map((p) => [p.id, p.name]));

  const leaderboard = [...card.totals]
    .filter((t) => t.holesPlayed > 0)
    .sort((a, b) => a.net - b.net || a.gross - b.gross);

  const settled = round.status === 'completed';

  return (
    <Screen>
      <Title>{courseName}</Title>
      <Small>
        {new Date(round.scheduled_at).toLocaleDateString(undefined, { timeZone: round.timezone })}
      </Small>

      <Card>
        <Heading>Leaderboard</Heading>
        {leaderboard.map((total, index) => (
          <Row key={total.roundPlayerId} justify="space-between">
            <Body>
              {index + 1}. {names[total.roundPlayerId]}
            </Body>
            <Small>
              {total.gross} gross · {total.net} net · thru {total.holesPlayed}
            </Small>
          </Row>
        ))}
      </Card>

      {card.moneyLine.map((line) => {
        const partitioned = partitionBreakdown(line.result, names);
        return (
          <Card key={line.gameId}>
            <Row justify="space-between">
              <Heading>{line.label}</Heading>
              {!line.result.isComplete ? <Small>in progress</Small> : null}
            </Row>
            {line.result.perPlayer.map((entry) => (
              <View key={entry.roundPlayerId} style={{ gap: spacing.xs }}>
                <Row justify="space-between">
                  <Body>{names[entry.roundPlayerId] ?? 'Player'}</Body>
                  <Money cents={entry.amountCents} />
                </Row>
                {/* Every money number opens into the lines that produced it. */}
                {(partitioned[entry.roundPlayerId]?.lines ?? []).map((bLine, i) => (
                  <Small key={`${entry.roundPlayerId}-${i}`}>· {bLine.text}</Small>
                ))}
              </View>
            ))}
          </Card>
        );
      })}

      <Divider />

      {settled ? (
        <>
          <Small>
            This round is settled. The crew ledger has the entries; corrections are new offsetting
            entries, never edits.
          </Small>
          <Button
            title="Open the crew ledger"
            variant="secondary"
            onPress={() => round.crew_id && router.push(`/crew/${round.crew_id}/ledger`)}
          />
        </>
      ) : (
        <>
          <Body muted>
            Finishing recomputes every game on the server and writes the ledger entries. Do it once
            the card is right.
          </Body>
          <Button
            title="Finish and settle"
            loading={complete.isPending}
            onPress={() => complete.mutate()}
          />
          {complete.error ? <Small>{(complete.error as Error).message}</Small> : null}
        </>
      )}
    </Screen>
  );
}
