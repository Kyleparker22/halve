import { useRouter } from 'expo-router';
import {
  Body,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Heading,
  Loading,
  Pill,
  Row,
  Screen,
  Small,
  Title,
} from '../../src/components/ui';
import { useRounds } from '../../src/hooks/useRounds';
import { useSession } from '../../src/hooks/useSession';

function when(iso: string, timezone: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  });
}

export default function RoundsScreen() {
  const router = useRouter();
  const { session } = useSession();
  const rounds = useRounds(session?.user.id);

  if (rounds.isLoading) return <Loading />;
  if (rounds.error) return <ErrorNote error={rounds.error} />;

  const all = rounds.data ?? [];
  const upcoming = all.filter((r) => r.status === 'scheduled' || r.status === 'in_progress');
  const played = all.filter((r) => r.status === 'completed').reverse();

  return (
    <Screen>
      <Row justify="space-between">
        <Title>Rounds</Title>
        <Button title="Schedule" variant="secondary" onPress={() => router.push('/round/new')} />
      </Row>

      {upcoming.length === 0 ? (
        <EmptyState title="Nothing on the book" hint="Schedule a round and the crew gets a push." />
      ) : null}

      {upcoming.map((round) => (
        <Card key={round.id} onPress={() => router.push(`/round/${round.id}`)}>
          <Row justify="space-between">
            <Heading>{round.courseName}</Heading>
            {round.status === 'in_progress' ? <Pill label="Live" tone="flag" /> : null}
          </Row>
          <Body muted>{when(round.scheduled_at, round.timezone)}</Body>
          <Row gap={8} wrap>
            <Small>
              {round.inCount} in
              {round.max_players ? ` of ${round.max_players}` : ''}
            </Small>
            {round.crewName ? <Small>· {round.crewName}</Small> : null}
            {round.myRsvp && round.myRsvp !== 'in' ? <Pill label={`You: ${round.myRsvp}`} /> : null}
            {round.visibility === 'friends_of_friends' ? <Pill label="Open seat" /> : null}
          </Row>
        </Card>
      ))}

      {played.length > 0 ? <Heading>Played</Heading> : null}
      {played.slice(0, 20).map((round) => (
        <Card key={round.id} onPress={() => router.push(`/round/${round.id}/recap`)}>
          <Row justify="space-between">
            <Body>{round.courseName}</Body>
            <Small>{when(round.scheduled_at, round.timezone)}</Small>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
