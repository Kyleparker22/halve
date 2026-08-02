import { useRouter } from 'expo-router';
import {
  Body,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Heading,
  Loading,
  Money,
  Row,
  Screen,
  Small,
  Title,
} from '../../src/components/ui';
import { useCrews } from '../../src/hooks/useCrews';
import { useSession } from '../../src/hooks/useSession';
import { useOpenSeats } from '../../src/hooks/useSocial';
import { useCrewBalancesForMe } from '../../src/hooks/useBalances';

export default function CrewsScreen() {
  const router = useRouter();
  const { session } = useSession();
  const crews = useCrews(session?.user.id);
  const balances = useCrewBalancesForMe(session?.user.id);
  const seats = useOpenSeats();

  if (crews.isLoading) return <Loading label="Loading your crews…" />;
  if (crews.error) return <ErrorNote error={crews.error} />;

  const balanceFor = (crewId: string) =>
    balances.data?.find((b) => b.crew_id === crewId)?.net_cents ?? 0;

  return (
    <Screen>
      <Row justify="space-between">
        <Title>Crews</Title>
        <Button title="New crew" variant="secondary" onPress={() => router.push('/crew/new')} />
      </Row>

      {(crews.data ?? []).length === 0 ? (
        <EmptyState
          title="No crews yet"
          hint="A crew is the group you actually play with. Make one and send the link."
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
