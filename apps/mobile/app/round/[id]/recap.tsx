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
import { ShareCard } from '../../../src/components/ShareCard';
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

  /**
   * What the share card says. Money is summed across every game — one Nassau
   * and a skins game is one number to a golfer, not two — and the headline is
   * the single biggest breakdown line, which is almost always the hole people
   * will actually argue about.
   */
  const moneyByPlayer = new Map<string, number>();
  for (const line of card.moneyLine) {
    for (const entry of line.result.perPlayer) {
      moneyByPlayer.set(
        entry.roundPlayerId,
        (moneyByPlayer.get(entry.roundPlayerId) ?? 0) + entry.amountCents,
      );
    }
  }
  const shareMoney = [...moneyByPlayer.entries()]
    .map(([roundPlayerId, amountCents]) => ({
      name: names[roundPlayerId] ?? 'Player',
      amountCents,
    }))
    .sort((a, b) => b.amountCents - a.amountCents);

  const headline =
    card.moneyLine
      .flatMap((line) => {
        const parts = partitionBreakdown(line.result, names);
        return line.result.perPlayer.flatMap((entry) =>
          (parts[entry.roundPlayerId]?.lines ?? []).map((bLine) => ({
            text: bLine.text,
            weight: Math.abs(entry.amountCents),
          })),
        );
      })
      .sort((a, b) => b.weight - a.weight)[0]?.text ?? null;

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

      {/* The round's natural end is somebody posting the result to the group
          chat. This is the only thing in the app built to be seen by people who
          do not have it. */}
      <ShareCard
        courseName={courseName}
        dateLabel={new Date(round.scheduled_at).toLocaleDateString(undefined, {
          timeZone: round.timezone,
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        })}
        money={shareMoney}
        headline={headline}
        leaderboard={leaderboard.map((total) => ({
          name: names[total.roundPlayerId] ?? 'Player',
          gross: total.gross,
        }))}
      />

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
