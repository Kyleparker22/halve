import { useState } from 'react';
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
  Segmented,
  Small,
  Title,
} from '../../src/components/ui';
import { useTrips } from '../../src/hooks/useTrips';

type TripsView = 'upcoming' | 'completed';

export default function TripsScreen() {
  const router = useRouter();
  const trips = useTrips();
  const [view, setView] = useState<TripsView>('upcoming');

  if (trips.isLoading) return <Loading />;
  if (trips.error) return <ErrorNote error={trips.error} onRetry={() => void trips.refetch()} />;

  const all = trips.data ?? [];
  /**
   * "Completed" is the status, not the calendar. A trip past its end date whose
   * money has not settled is still live — closing it is what complete_trip()
   * does, and that is gated on the ledger being clean.
   */
  const completed = all.filter((t) => t.status === 'completed' || t.status === 'cancelled');
  const upcoming = all.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
  const shown = view === 'upcoming' ? upcoming : [...completed].reverse();

  return (
    <Screen>
      <Row justify="space-between">
        <Title>Trips</Title>
        <Button title="New trip" variant="secondary" onPress={() => router.push('/trip/new')} />
      </Row>

      <Segmented
        options={[
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'completed', label: 'Completed' },
        ]}
        value={view}
        onChange={setView}
      />

      {shown.length === 0 ? (
        view === 'upcoming' ? (
          <EmptyState
            title="No trips on the calendar"
            hint="Rooms, pairings, expenses and one settlement at the end."
            actions={[{ label: 'Plan a trip', onPress: () => router.push('/trip/new') }]}
          />
        ) : (
          <EmptyState
            title="Nothing completed yet"
            hint="A trip lands here once its money is settled and it is marked done."
          />
        )
      ) : null}

      {shown.map((trip) => (
        <Card
          key={trip.id}
          onPress={() =>
            router.push(view === 'completed' ? `/trip/${trip.id}/recap` : `/trip/${trip.id}`)
          }
        >
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
