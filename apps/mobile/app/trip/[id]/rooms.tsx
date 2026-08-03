import { useState } from 'react';
import { Pressable, TextInput } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
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
import { useAssignRoom, useCreateRoom, useTrip } from '../../../src/hooks/useTrips';
import { radius, spacing, useTheme } from '../../../src/theme';

export default function RoomsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const trip = useTrip(id);
  const createRoom = useCreateRoom(id);
  const assign = useAssignRoom(id);

  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('2');
  const [cost, setCost] = useState('');
  const [moving, setMoving] = useState<string | null>(null);

  if (trip.isLoading) return <Loading />;
  if (trip.error) return <ErrorNote error={trip.error} />;
  if (!trip.data) return null;

  const { members, rooms } = trip.data;
  const going = members.filter((m) => m.status === 'in');

  const input = {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.md,
    color: theme.text,
    padding: spacing.md,
    minHeight: 48,
  };

  const dollarsToCents = (value: string): number => {
    const parsed = Math.round(Number(value.replace(/[^0-9.]/g, '')) * 100);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return (
    <Screen>
      <Title>Rooms</Title>
      <Small>
        A room&apos;s cost splits evenly across whoever is in it, and re-splits the moment someone
        moves.
      </Small>

      {rooms.map((room) => {
        const occupants = members.filter((m) => m.room_id === room.id);
        const over = occupants.length > room.capacity;
        const each = occupants.length > 0 ? room.cost_cents / occupants.length : room.cost_cents;
        return (
          <Card key={room.id}>
            <Row justify="space-between">
              <Heading>{room.name}</Heading>
              <Small>
                ${(room.cost_cents / 100).toFixed(0)} · {occupants.length}/{room.capacity}
              </Small>
            </Row>
            {occupants.length === 0 ? (
              <Small>Nobody in here yet.</Small>
            ) : (
              occupants.map((occupant) => (
                <Row key={occupant.id} justify="space-between">
                  <Row gap={6}>
                    <Body>{occupant.name}</Body>
                    {occupant.isGuest ? <Pill label="guest" /> : null}
                  </Row>
                  <Row gap={spacing.sm}>
                    <Small>${(each / 100).toFixed(2)}</Small>
                    <Button
                      title="Out"
                      variant="secondary"
                      onPress={() => assign.mutate({ memberId: occupant.id, roomId: null })}
                    />
                  </Row>
                </Row>
              ))
            )}
            {/* Capacity is guidance, not a rule — somebody always takes the
                couch — so this says so rather than refusing the assignment. */}
            {over ? <Small>Over capacity. Fine if someone is on the pull-out.</Small> : null}
          </Card>
        );
      })}

      <Card>
        <Heading>Unassigned</Heading>
        {going.filter((m) => !m.room_id).length === 0 ? (
          <Small>Everyone who is in has a bed.</Small>
        ) : (
          going
            .filter((m) => !m.room_id)
            .map((member) => (
              <Row key={member.id} justify="space-between">
                <Body>{member.name}</Body>
                {rooms.length === 0 ? (
                  <Small>add a room first</Small>
                ) : (
                  <Button
                    title={moving === member.id ? 'Pick a room' : 'Put somewhere'}
                    variant="secondary"
                    onPress={() => setMoving(moving === member.id ? null : member.id)}
                  />
                )}
              </Row>
            ))
        )}
        {moving ? (
          <Row wrap gap={spacing.sm}>
            {rooms.map((room) => (
              <Pressable
                key={room.id}
                onPress={() => {
                  assign.mutate({ memberId: moving, roomId: room.id });
                  setMoving(null);
                }}
              >
                <Body style={{ color: theme.accent }}>{room.name}</Body>
              </Pressable>
            ))}
          </Row>
        ) : null}
      </Card>

      {assign.error ? <ErrorNote error={assign.error} /> : null}

      <Card>
        <Heading>Add a room</Heading>
        <TextInput
          style={input}
          value={name}
          onChangeText={setName}
          placeholder="Lodge 2A"
          placeholderTextColor={theme.muted}
        />
        <Row gap={spacing.sm}>
          <TextInput
            style={[input, { flex: 1 }]}
            value={capacity}
            onChangeText={setCapacity}
            keyboardType="number-pad"
            placeholder="Sleeps"
            placeholderTextColor={theme.muted}
          />
          <TextInput
            style={[input, { flex: 1 }]}
            value={cost}
            onChangeText={setCost}
            keyboardType="decimal-pad"
            placeholder="Total $"
            placeholderTextColor={theme.muted}
          />
        </Row>
        {createRoom.error ? <ErrorNote error={createRoom.error} /> : null}
        <Button
          title="Add it"
          disabled={name.trim().length === 0 || createRoom.isPending}
          onPress={() =>
            createRoom.mutate(
              {
                name: name.trim(),
                capacity: Math.max(1, Number(capacity) || 1),
                costCents: dollarsToCents(cost),
              },
              {
                onSuccess: () => {
                  setName('');
                  setCapacity('2');
                  setCost('');
                },
              },
            )
          }
        />
      </Card>
    </Screen>
  );
}
