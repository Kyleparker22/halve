import { Share } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Body,
  Button,
  Card,
  ErrorNote,
  Heading,
  Loading,
  Pill,
  Row,
  Screen,
  Small,
  Title,
} from '../../../src/components/ui';
import { generatePairings, useAssignRoom, useTrip } from '../../../src/hooks/useTrips';

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const trip = useTrip(id);
  const assign = useAssignRoom(id);

  if (trip.isLoading) return <Loading />;
  if (trip.error) return <ErrorNote error={trip.error} />;
  if (!trip.data) return null;

  const { trip: detail, members, rooms, rounds } = trip.data;
  const going = members.filter((m) => m.status === 'in');
  const pairings = generatePairings(
    going.map((m) => m.id),
    Math.max(1, rounds.length),
  );
  const nameFor = (memberId: string) => members.find((m) => m.id === memberId)?.name ?? 'Player';

  return (
    <Screen>
      <Title>{detail.name}</Title>
      <Small>
        {detail.destination} · {detail.start_date} → {detail.end_date}
      </Small>

      <Card>
        <Row justify="space-between">
          <Heading>Roster</Heading>
          <Small>{going.length} in</Small>
        </Row>
        {members.map((member) => (
          <Row key={member.id} justify="space-between">
            <Row gap={6}>
              <Body>{member.name}</Body>
              {member.isGuest ? <Pill label="guest" /> : null}
            </Row>
            <Small>
              {member.status}
              {member.room_id ? ` · ${rooms.find((r) => r.id === member.room_id)?.name ?? ''}` : ''}
            </Small>
          </Row>
        ))}
      </Card>

      <Card>
        <Row justify="space-between">
          <Heading>Rooms</Heading>
          <Small>cost splits to whoever is in them</Small>
        </Row>
        {rooms.map((room) => {
          const occupants = members.filter((m) => m.room_id === room.id);
          return (
            <Row key={room.id} justify="space-between">
              <Body>
                {room.name} · {occupants.length}/{room.capacity}
              </Body>
              <Small>${(room.cost_cents / 100).toFixed(0)}</Small>
            </Row>
          );
        })}
        {members
          .filter((m) => m.status === 'in' && !m.room_id)
          .map((member) => (
            <Row key={member.id} justify="space-between">
              <Small>{member.name} has no room</Small>
              {rooms[0] ? (
                <Button
                  title={`Put in ${rooms[0].name}`}
                  variant="secondary"
                  onPress={() => assign.mutate({ memberId: member.id, roomId: rooms[0]!.id })}
                />
              ) : null}
            </Row>
          ))}
      </Card>

      <Card>
        <Row justify="space-between">
          <Heading>Itinerary</Heading>
          <Button title="Add a round" variant="secondary" onPress={() => router.push('/round/new')} />
        </Row>
        {rounds.length === 0 ? <Small>No rounds scheduled yet.</Small> : null}
        {rounds.map((round, index) => (
          <Row key={round.id} justify="space-between">
            <Body onPress={() => router.push(`/round/${round.id}`)}>
              Day {index + 1} · {new Date(round.scheduled_at).toLocaleDateString()}
            </Body>
            <Small>{round.hole_count} holes</Small>
          </Row>
        ))}
      </Card>

      {going.length >= 4 && rounds.length > 0 ? (
        <Card>
          <Heading>Pairings</Heading>
          <Small>Nobody plays with the same person twice until they have to.</Small>
          {pairings.map((groups, roundIndex) => (
            <Row key={roundIndex} justify="space-between">
              <Small>Day {roundIndex + 1}</Small>
              <Small>{groups.map((g) => g.map(nameFor).join(', ')).join('  |  ')}</Small>
            </Row>
          ))}
        </Card>
      ) : null}

      <Button title="Expenses" onPress={() => router.push(`/trip/${id}/expenses`)} />
      <Button title="Trip chat" variant="secondary" onPress={() => router.push(`/chat/trip/${id}`)} />
      <Button
        title="Invite by link"
        variant="secondary"
        onPress={() =>
          void Share.share({
            message: `Come to ${detail.name}: https://halve.golf/join/${detail.invite_code}`,
          })
        }
      />
    </Screen>
  );
}
