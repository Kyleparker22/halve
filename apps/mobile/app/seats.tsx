import {
  Body,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Heading,
  Loading,
  Screen,
  Small,
  Title,
} from '../src/components/ui';
import { useOpenSeats, useRequestSeat } from '../src/hooks/useSocial';

/**
 * Open seats, two hops out. Every card names the person who connects you to the
 * round — a seat with no vouching edge would just be stranger matching, which
 * is the thing that has killed every app that tried it.
 */
export default function SeatsScreen() {
  const seats = useOpenSeats();
  const request = useRequestSeat();

  if (seats.isLoading) return <Loading />;
  if (seats.error) return <ErrorNote error={seats.error} />;

  return (
    <Screen>
      <Title>Open seats</Title>
      {(seats.data ?? []).length === 0 ? (
        <EmptyState
          title="Nothing open right now"
          hint="Seats show up here when someone in your crews' crews is a man short."
        />
      ) : null}

      {(seats.data ?? []).map((seat) => (
        <Card key={seat.round_id}>
          <Heading>{seat.course_name}</Heading>
          <Body muted>
            {new Date(seat.scheduled_at).toLocaleString(undefined, { timeZone: seat.timezone })}
          </Body>
          <Small>
            {seat.host_crew_name} · {seat.open_seats} open · you know {seat.vouch_display_name}
          </Small>
          <Button
            title="Ask for the seat"
            variant="secondary"
            loading={request.isPending}
            onPress={() => request.mutate(seat.round_id)}
          />
        </Card>
      ))}
      {request.error ? <Small>{(request.error as Error).message}</Small> : null}
    </Screen>
  );
}
