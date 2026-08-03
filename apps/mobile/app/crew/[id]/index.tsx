import { Share } from 'react-native';
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
import { useCrew, useCrewGuests, useCrewMembers } from '../../../src/hooks/useCrews';
import { useCrewBalances } from '../../../src/hooks/useBalances';
import { useFeed } from '../../../src/hooks/useSocial';
import { useRounds } from '../../../src/hooks/useRounds';
import { useSession } from '../../../src/hooks/useSession';
import { describeFeedItem } from '../../../src/components/FeedItem';

export default function CrewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const crew = useCrew(id);
  const members = useCrewMembers(id);
  const guests = useCrewGuests(id);
  const balances = useCrewBalances(id);
  const feed = useFeed(id);
  const rounds = useRounds(session?.user.id);

  if (crew.isLoading) return <Loading />;
  if (crew.error) return <ErrorNote error={crew.error} />;
  if (!crew.data) return null;

  const next = (rounds.data ?? [])
    .filter((r) => r.crew_id === id && r.status !== 'completed' && r.status !== 'cancelled')
    .at(0);
  const myBalance =
    (balances.data ?? []).find((b) => b.profile_id === session?.user.id)?.net_cents ?? 0;

  return (
    <Screen>
      <Title>{crew.data.name}</Title>

      {/* Priority order from the product spec: next round, your balance, activity, members. */}
      {next ? (
        <Card onPress={() => router.push(`/round/${next.id}`)}>
          <Heading>Next round</Heading>
          <Body>{next.courseName}</Body>
          <Small>
            {new Date(next.scheduled_at).toLocaleString(undefined, { timeZone: next.timezone })} ·{' '}
            {next.inCount} in
          </Small>
        </Card>
      ) : (
        <Button title="Schedule a round" onPress={() => router.push('/round/new')} />
      )}

      <Card onPress={() => router.push(`/crew/${id}/ledger`)}>
        <Row justify="space-between">
          <Heading>Your balance</Heading>
          <Money cents={myBalance} size={22} />
        </Row>
        <Small>Season to date, open entries only. Tap for the full ledger.</Small>
      </Card>

      <Card>
        <Row justify="space-between">
          <Heading>Members</Heading>
          <Small>{(members.data ?? []).length}</Small>
        </Row>
        {(members.data ?? []).map((member) => {
          const balance =
            (balances.data ?? []).find((b) => b.profile_id === member.profileId)?.net_cents ?? 0;
          return (
            <Row key={member.profileId} justify="space-between">
              <Row gap={6}>
                <Body>{member.profile.display_name}</Body>
                {member.role !== 'member' ? <Pill label={member.role} /> : null}
              </Row>
              <Money cents={balance} size={15} />
            </Row>
          );
        })}
        {(guests.data ?? []).map((guest) => (
          <Row key={guest.id} justify="space-between">
            <Row gap={6}>
              <Body>{guest.name}</Body>
              <Pill label="guest" />
            </Row>
            <Small>settles through their voucher</Small>
          </Row>
        ))}
      </Card>

      <Button title="Season standings" onPress={() => router.push(`/crew/${id}/season`)} />
      <Button
        title="Guests"
        variant="secondary"
        onPress={() => router.push(`/crew/${id}/guests`)}
      />
      <Button
        title="Invite to the crew"
        variant="secondary"
        onPress={() =>
          void Share.share({
            message: `Join ${crew.data!.name} on Bagdrop: https://halve.golf/join/${crew.data!.invite_code}`,
          })
        }
      />
      <Button
        title="Crew chat"
        variant="secondary"
        onPress={() => router.push(`/chat/crew/${id}`)}
      />

      <Card>
        <Row justify="space-between">
          <Heading>Recent</Heading>
          <Button
            title="See all"
            variant="secondary"
            onPress={() => router.push(`/crew/${id}/feed`)}
          />
        </Row>
        {(feed.data ?? []).length === 0 ? (
          <Small>
            Rounds, trips, people joining and money settling all show up here as they happen.
          </Small>
        ) : (
          (feed.data ?? [])
            .slice(0, 5)
            .map((item) => (
              <Row key={item.id} justify="space-between">
                <Body numberOfLines={1}>
                  {describeFeedItem(item.type, item.payload, item.actor?.display_name ?? null)}
                </Body>
                <Small>{new Date(item.created_at ?? '').toLocaleDateString()}</Small>
              </Row>
            ))
        )}
      </Card>

    </Screen>
  );
}
