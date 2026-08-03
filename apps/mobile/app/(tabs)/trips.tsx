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
import { useTrips } from '../../src/hooks/useTrips';

export default function TripsScreen() {
  const router = useRouter();
  const trips = useTrips();

  if (trips.isLoading) return <Loading />;
  if (trips.error) return <ErrorNote error={trips.error} />;

  return (
    <Screen>
      <Row justify="space-between">
        <Title>Trips</Title>
        <Button title="New trip" variant="secondary" onPress={() => router.push('/trip/new')} />
      </Row>

      {(trips.data ?? []).length === 0 ? (
        <EmptyState
          title="No trips yet"
          hint="Rooms, pairings, expenses and one settlement at the end."
          actions={[{ label: 'Plan a trip', onPress: () => router.push('/trip/new') }]}
        />
      ) : null}

      {(trips.data ?? []).map((trip) => (
        <Card key={trip.id} onPress={() => router.push(`/trip/${trip.id}`)}>
          <Row justify="space-between">
            <Heading>{trip.name}</Heading>
            <Pill label={trip.status} />
          </Row>
          <Body muted>{trip.destination}</Body>
          <Small>
            {trip.start_date} → {trip.end_date}
            {trip.crewName ? ` · ${trip.crewName}` : ''}
          </Small>
        </Card>
      ))}
    </Screen>
  );
}
