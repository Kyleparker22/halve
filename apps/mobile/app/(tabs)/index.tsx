import { useRouter } from 'expo-router';
import {
  Body,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Heading,
  Money,
  Row,
  Screen,
  SkeletonList,
  Small,
  Title,
} from '../../src/components/ui';
import { useCrews } from '../../src/hooks/useCrews';
import { useSession } from '../../src/hooks/useSession';
import { useOpenSeats } from '../../src/hooks/useSocial';
import { useRounds } from '../../src/hooks/useRounds';
import { useCrewBalancesForMe } from '../../src/hooks/useBalances';

export default function CrewsScreen() {
  const router = useRouter();
  const { session } = useSession();
  const crews = useCrews(session?.user.id);
  const balances = useCrewBalancesForMe(session?.user.id);
  const seats = useOpenSeats();
  const rounds = useRounds(session?.user.id);

  if (crews.isLoading)
    return (
      <Screen>
        <Title>Crews</Title>
        <SkeletonList />
      </Screen>
    );
  if (crews.error) return <ErrorNote error={crews.error} onRetry={() => void crews.refetch()} />;

  const balanceFor = (crewId: string) =>
    balances.data?.find((b) => b.crew_id === crewId)?.net_cents ?? 0;

  return (
    <Screen>
      <Row justify="space-between">
        <Title>Crews</Title>
        <Button title="New crew" variant="secondary" onPress={() => router.push('/crew/new')} />
      </Row>

      {/* The first screen after sign-up. A dead end here is where new users
          leave, so it says what to do and hands over the button — including
          the invite-code path, which was previously reachable only by tapping
          "New crew", which is the last thing someone with a code would tap. */}
      {(crews.data ?? []).length === 0 ? (
        <EmptyState
          title="Start with your regular four"
          hint="A crew is the group you actually play with. Everything — scores, side games, who owes who — hangs off it. You can play a round on your own too; add the others whenever."
          actions={[
            { label: 'Start a crew', onPress: () => router.push('/crew/new') },
            {
              label: 'I have an invite code',
              variant: 'secondary',
              onPress: () => router.push('/crew/new?mode=join'),
            },
          ]}
        />
      ) : null}

      {/* Has a crew, has never played. The next step is a round, not another
          crew, and nothing on this screen said so. */}
      {(crews.data ?? []).length > 0 && (rounds.data ?? []).length === 0 ? (
        <EmptyState
          title="Now put a round on the books"
          hint="Pick a course and a time. Scoring works with no signal, so the course being a dead zone does not matter."
          actions={[{ label: 'Schedule a round', onPress: () => router.push('/round/new') }]}
        />
      ) : null}

      {(crews.data ?? []).map((crew) => (
        <Card key={crew.id} onPress={() => router.push(`/crew/${crew.id}`)}>
          <Row justify="space-between">
            <Heading>{crew.name}</Heading>
            <Money cents={balanceFor(crew.id)} />
          </Row>
          <Small>
            {crew.memberCount} {crew.memberCount === 1 ? 'member' : 'members'} ·{' '}
            {crew.role === 'member' ? "you're a member" : `you're the ${crew.role}`}
          </Small>
        </Card>
      ))}

      {(seats.data ?? []).length > 0 ? (
        <>
          <Heading>Open seats near you</Heading>
          {(seats.data ?? []).slice(0, 3).map((seat) => (
            <Card key={seat.round_id} onPress={() => router.push('/seats')}>
              <Body>
                {seat.course_name} · {new Date(seat.scheduled_at).toLocaleString()}
              </Body>
              {/* The vouching edge is the whole point — never show a bare stranger. */}
              <Small>
                {seat.host_crew_name} · vouched by {seat.vouch_display_name} · {seat.open_seats}{' '}
                open
              </Small>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
