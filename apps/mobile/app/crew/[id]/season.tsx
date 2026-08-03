import { useState } from 'react';
import { Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Body,
  Button,
  Card,
  ErrorNote,
  Heading,
  Loading,
  Money,
  Pill,
  Row,
  Screen,
  Small,
  Title,
} from '../../../src/components/ui';
import { currentSeason, useCrewSeason } from '../../../src/hooks/useSeason';
import { useCrew } from '../../../src/hooks/useCrews';
import { spacing, useTheme } from '../../../src/theme';

export default function SeasonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const thisYear = currentSeason();
  const [year, setYear] = useState(thisYear);
  const crew = useCrew(id);
  const season = useCrewSeason(id, year);

  if (season.isLoading) return <Loading />;
  if (season.error) return <ErrorNote error={season.error} />;
  if (!season.data) return null;

  const { players, roundsPlayed, lowRound, biggestWin } = season.data;
  const byScoring = [...players]
    .filter((p) => p.scoringAverage !== null)
    .sort((a, b) => (a.scoringAverage ?? 0) - (b.scoringAverage ?? 0));

  return (
    <Screen>
      <Title>{crew.data?.name ?? 'Season'}</Title>
      <Row gap={spacing.md}>
        {[thisYear, thisYear - 1, thisYear - 2].map((option) => (
          <Pressable key={option} onPress={() => setYear(option)}>
            <Body style={{ color: option === year ? theme.accent : theme.muted }}>{option}</Body>
          </Pressable>
        ))}
      </Row>
      <Small>
        {roundsPlayed} {roundsPlayed === 1 ? 'round' : 'rounds'} in {year}
      </Small>

      {roundsPlayed === 0 ? (
        <Card>
          <Heading>Nothing here yet</Heading>
          <Small>
            Standings fill in as rounds are finished. Play one and settle it — that is what puts
            money on this page.
          </Small>
        </Card>
      ) : null}

      {players.length > 0 ? (
        <Card>
          <Heading>The money</Heading>
          <Small>Across every round and trip this season, guests resolved to their vouchers.</Small>
          {players.map((player) => (
            <Row key={player.key} justify="space-between">
              <Row gap={6}>
                <Body>{player.name}</Body>
                {player.isGuest ? <Pill label="guest" /> : null}
              </Row>
              <Money cents={player.netCents} />
            </Row>
          ))}
        </Card>
      ) : null}

      {byScoring.length > 0 ? (
        <Card>
          <Heading>Scoring</Heading>
          {byScoring.map((player, index) => (
            <Row key={player.key} justify="space-between">
              <Body>
                {index + 1}. {player.name}
              </Body>
              <Small>
                {player.scoringAverage} avg · best {player.bestGross} ·{' '}
                {player.roundsPlayed}
                {player.roundsPlayed === 1 ? ' round' : ' rounds'}
              </Small>
            </Row>
          ))}
        </Card>
      ) : null}

      {lowRound || biggestWin ? (
        <Card>
          <Heading>Season bests</Heading>
          {lowRound ? (
            <Row justify="space-between">
              <Body>Low round</Body>
              <Small>
                {lowRound.name} — {lowRound.strokes}
              </Small>
            </Row>
          ) : null}
          {biggestWin ? (
            <Row justify="space-between">
              <Body>Biggest day</Body>
              <Small>
                {biggestWin.name} — ${(biggestWin.amountCents / 100).toFixed(0)}
              </Small>
            </Row>
          ) : null}
          {lowRound ? (
            <Button
              title="See that card"
              variant="secondary"
              onPress={() => router.push(`/round/${lowRound.roundId}/card`)}
            />
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}
