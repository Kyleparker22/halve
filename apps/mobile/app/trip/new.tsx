import { useState } from 'react';
import { Pressable, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button, Card, Heading, Row, Screen, Small, Title } from '../../src/components/ui';
import { useCrews } from '../../src/hooks/useCrews';
import { useCreateTrip } from '../../src/hooks/useTrips';
import { useSession } from '../../src/hooks/useSession';
import { radius, spacing, useTheme } from '../../src/theme';

export default function NewTripScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const crews = useCrews();
  const create = useCreateTrip();

  const [crewId, setCrewId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [start, setStart] = useState(isoDate(30));
  const [end, setEnd] = useState(isoDate(33));

  const input = {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.md,
    color: theme.text,
    padding: spacing.md,
    minHeight: 48,
  };

  return (
    <Screen>
      <Title>New trip</Title>

      <Card>
        <Heading>Crew</Heading>
        <Row wrap gap={spacing.sm}>
          {(crews.data ?? []).map((crew) => (
            <Pressable key={crew.id} onPress={() => setCrewId(crew.id)}>
              <Body style={{ color: crewId === crew.id ? theme.accent : theme.text }}>
                {crew.name}
              </Body>
            </Pressable>
          ))}
        </Row>
      </Card>

      <Card>
        <TextInput
          style={input}
          value={name}
          onChangeText={setName}
          placeholder="Sand Valley"
          placeholderTextColor={theme.muted}
        />
        <TextInput
          style={input}
          value={destination}
          onChangeText={setDestination}
          placeholder="Nekoosa, WI"
          placeholderTextColor={theme.muted}
        />
        <Row gap={spacing.sm}>
          <TextInput style={[input, { flex: 1 }]} value={start} onChangeText={setStart} />
          <TextInput style={[input, { flex: 1 }]} value={end} onChangeText={setEnd} />
        </Row>
        <Small>Start and end dates, YYYY-MM-DD.</Small>
      </Card>

      <Button
        title="Create trip"
        disabled={!crewId || name.trim().length === 0}
        loading={create.isPending}
        onPress={() =>
          create.mutate(
            {
              crewId: crewId!,
              name: name.trim(),
              destination: destination.trim(),
              startDate: start,
              endDate: end,
              createdBy: session!.user.id,
            },
            { onSuccess: (trip) => router.replace(`/trip/${trip.id}`) },
          )
        }
      />
      {create.error ? <Small>{(create.error as Error).message}</Small> : null}
    </Screen>
  );
}

function isoDate(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}
