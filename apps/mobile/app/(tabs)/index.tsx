import { useState } from 'react';
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
  Segmented,
  SkeletonList,
  Small,
  Title,
} from '../../src/components/ui';
import { useCrews } from '../../src/hooks/useCrews';
import { useFriends } from '../../src/hooks/useFriends';
import { useSession } from '../../src/hooks/useSession';
import { useOpenSeats } from '../../src/hooks/useSocial';
import { useRounds } from '../../src/hooks/useRounds';
import { useCrewBalancesForMe } from '../../src/hooks/useBalances';

type FriendsView = 'people' | 'crews';

export default function FriendsScreen() {
  const router = useRouter();
  const { session } = useSession();
  const [view, setView] = useState<FriendsView>('people');
  const crews = useCrews(session?.user.id);
  const friends = useFriends(session?.user.id);
  const balances = useCrewBalancesForMe(session?.user.id);
  const seats = useOpenSeats();
  const rounds = useRounds(session?.user.id);

  if (crews.isLoading)
    return (
      <Screen>
        <Title>Friends</Title>
        <SkeletonList />
      </Screen>
    );
  if (crews.error) return <ErrorNote error={crews.error} onRetry={() => void crews.refetch()} />;

  const balanceFor = (crewId: string) =>
    balances.data?.find((b) => b.crew_id === crewId)?.net_cents ?? 0;

  const noCrews = (crews.data ?? []).length === 0;

  return (
    <Screen>
      <Row justify="space-between">
        <Title>Friends</Title>
        <Button title="New crew" variant="secondary" onPress={() => router.push('/crew/new')} />
      </Row>

      {/* The first screen after sign-up. A dead end here is where new users
          leave — and with no crew there are no friends either, so the toggle
          would be two empty lists. Show the door instead. */}
      {noCrews ? (
        <EmptyState
          title="Start with your regular four"
          hint="A crew is the group you actually play with. Everything — friends, scores, side games, who owes who — hangs off it."
          actions={[
            { label: 'Start a crew', onPress: () => router.push('/crew/new') },
            {
              label: 'I have an invite code',
              variant: 'secondary',
              onPress: () => router.push('/crew/new?mode=join'),
            },
          ]}
        />
      ) : (
        <Segmented
          options={[
            { value: 'people', label: 'Friends' },
            { value: 'crews', label: 'Crews' },
          ]}
          value={view}
          onChange={setView}
        />
      )}

      {/* Has a crew, has never played. The next step is a round, not another
          crew, and nothing on this screen said so. */}
      {!noCrews && (rounds.data ?? []).length === 0 ? (
        <EmptyState
          title="Now put a round on the books"
          hint="Pick a course and a time. Scoring works with no signal, so the course being a dead zone does not matter."
          actions={[{ label: 'Schedule a round', onPress: () => router.push('/round/new') }]}
        />
      ) : null}

      {!noCrews && view === 'people' ? (
        <>
          {(friends.data ?? []).length === 0 ? (
            <EmptyState
              title="Nobody yet"
              hint="Friends are the people in your crews. Get the group in and they show up here."
              actions={[
                {
                  label: 'Invite the crew',
                  onPress: () => router.push(`/crew/${crews.data![0]!.id}`),
                },
              ]}
            />
          ) : (
            (friends.data ?? []).map((friend) => (
              <Card key={friend.profileId}>
                <Row justify="space-between">
                  <Body>{friend.name}</Body>
                  <Small>{friend.handicap !== null ? `${friend.handicap} hcp` : 'no index'}</Small>
                </Row>
                <Small>
                  @{friend.handle}
                  {friend.location ? ` · ${friend.location}` : ''}
                  {friend.sharedCrews.length > 0 ? ` · ${friend.sharedCrews.join(', ')}` : ''}
                </Small>
              </Card>
            ))
          )}
        </>
      ) : null}

      {!noCrews && view === 'crews'
        ? (crews.data ?? []).map((crew) => (
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
          ))
        : null}

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
