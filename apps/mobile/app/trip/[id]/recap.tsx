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
import { useTrip, useTripRecap } from '../../../src/hooks/useTrips';
import { useTripLedger } from '../../../src/hooks/useLedger';
import { useCrewMembers } from '../../../src/hooks/useCrews';

export default function TripRecapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const trip = useTrip(id);
  const recap = useTripRecap(id);
  const ledger = useTripLedger(id);
  const members = useCrewMembers(trip.data?.trip.crew_id ?? undefined);

  if (trip.isLoading || recap.isLoading) return <Loading />;
  if (recap.error) return <ErrorNote error={recap.error} />;
  if (!trip.data || !recap.data) return null;

  const { standings, lowRound, roundsPlayed } = recap.data;
  const nameFor = (profileId: string) =>
    members.data?.find((m) => m.profileId === profileId)?.profile.display_name ?? 'Someone';

  // Money across the whole trip, whether or not it has been settled yet.
  const money = [...(ledger.data?.positions ?? [])].sort((a, b) => b.netCents - a.netCents);

  return (
    <Screen>
      <Title>{trip.data.trip.name}</Title>
      <Small>
        {trip.data.trip.destination} · {roundsPlayed}{' '}
        {roundsPlayed === 1 ? 'round' : 'rounds'} played
      </Small>

      {roundsPlayed === 0 ? (
        <Card>
          <Heading>Nothing to recap yet</Heading>
          <Small>
            Standings appear once a round is finished. A round in progress is left out on purpose —
            otherwise whoever teed off first looks like the runaway leader.
          </Small>
        </Card>
      ) : null}

      {lowRound ? (
        <Card>
          <Heading>Low round of the trip</Heading>
          <Row justify="space-between">
            <Body>{lowRound.name}</Body>
            <Body>{lowRound.strokes}</Body>
          </Row>
          <Button
            title="See that card"
            variant="secondary"
            onPress={() => router.push(`/round/${lowRound.roundId}/card`)}
          />
        </Card>
      ) : null}

      {standings.length > 0 ? (
        <Card>
          <Heading>Standings</Heading>
          <Small>By net total across every finished round. Lowest wins.</Small>
          {standings.map((standing, index) => (
            <Row key={standing.key} justify="space-between">
              <Row gap={6}>
                <Small>{index + 1}</Small>
                <Body>{standing.name}</Body>
                {standing.isGuest ? <Pill label="guest" /> : null}
              </Row>
              <Small>
                {standing.netTotal} net · {standing.grossTotal} gross ·{' '}
                {standing.roundsPlayed}
                {standing.roundsPlayed === 1 ? ' round' : ' rounds'}
                {standing.bestGross !== null ? ` · best ${standing.bestGross}` : ''}
              </Small>
            </Row>
          ))}
        </Card>
      ) : null}

      <Card>
        <Heading>Money</Heading>
        {money.length === 0 ? (
          <Small>Nobody is up or down. Either nothing was played for, or it all settled.</Small>
        ) : (
          money.map((position) => (
            <Row key={position.profileId} justify="space-between">
              <Body>{nameFor(position.profileId)}</Body>
              <Money cents={position.netCents} />
            </Row>
          ))
        )}
        <Button
          title="Settle up"
          variant="secondary"
          onPress={() => router.push(`/trip/${id}/settle`)}
        />
      </Card>
    </Screen>
  );
}
