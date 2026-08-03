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
import { useTrip } from '../../../src/hooks/useTrips';

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const trip = useTrip(id);

  if (trip.isLoading) return <Loading />;
  if (trip.error) return <ErrorNote error={trip.error} />;
  if (!trip.data) return null;

  const { trip: detail, members, rooms, rounds, pairingsByRound } = trip.data;
  const going = members.filter((m) => m.status === 'in');
  const unassigned = going.filter((m) => !m.room_id);
  const paired = Object.values(pairingsByRound).some((players) =>
    players.some((p) => p.groupNumber !== null),
  );

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
          <Button
            title={rooms.length === 0 ? 'Add rooms' : 'Manage'}
            variant="secondary"
            onPress={() => router.push(`/trip/${id}/rooms`)}
          />
        </Row>
        {rooms.length === 0 ? (
          <Small>No rooms yet. Add them and the cost splits across whoever sleeps in them.</Small>
        ) : (
          rooms.map((room) => {
            const occupants = members.filter((m) => m.room_id === room.id);
            return (
              <Row key={room.id} justify="space-between">
                <Body>
                  {room.name} · {occupants.length}/{room.capacity}
                </Body>
                <Small>${(room.cost_cents / 100).toFixed(0)}</Small>
              </Row>
            );
          })
        )}
        {unassigned.length > 0 && rooms.length > 0 ? (
          <Small>
            {unassigned.length} {unassigned.length === 1 ? 'person has' : 'people have'} no bed yet.
          </Small>
        ) : null}
      </Card>

      <Card>
        <Row justify="space-between">
          <Heading>Itinerary</Heading>
          {/* The trip id has to travel with this. Without it the round is
              created detached and never appears here again. */}
          <Button
            title="Add a round"
            variant="secondary"
            onPress={() =>
              router.push(`/round/new?trip=${id}&crew=${detail.crew_id}`)
            }
          />
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

      <Card>
        <Row justify="space-between">
          <Heading>Pairings</Heading>
          <Button
            title={paired ? 'Manage' : 'Set them up'}
            variant="secondary"
            onPress={() => router.push(`/trip/${id}/pairings`)}
          />
        </Row>
        {!paired ? (
          <Small>Nobody plays with the same person twice until they have to.</Small>
        ) : (
          rounds.map((round, roundIndex) => {
            const players = pairingsByRound[round.id] ?? [];
            const numbers = [
              ...new Set(players.map((p) => p.groupNumber).filter((n): n is number => n !== null)),
            ].sort((a, b) => a - b);
            if (numbers.length === 0) return null;
            return (
              <Row key={round.id} justify="space-between">
                <Small>Day {roundIndex + 1}</Small>
                <Small>
                  {numbers
                    .map((n) =>
                      players
                        .filter((p) => p.groupNumber === n)
                        .map((p) => p.name)
                        .join(', '),
                    )
                    .join('  |  ')}
                </Small>
              </Row>
            );
          })
        )}
      </Card>

      <Button title="Expenses" onPress={() => router.push(`/trip/${id}/expenses`)} />
      <Button title="Trip money" onPress={() => router.push(`/trip/${id}/settle`)} />
      <Button
        title="Recap"
        variant="secondary"
        onPress={() => router.push(`/trip/${id}/recap`)}
      />
      <Button
        title="Trip chat"
        variant="secondary"
        onPress={() => router.push(`/chat/trip/${id}`)}
      />
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
