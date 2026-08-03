import { useEffect } from 'react';
import { Linking } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { cashAppLink, formatCents, venmoLink } from '@halve/ledger';
import {
  Body,
  Button,
  Card,
  Divider,
  ErrorNote,
  Heading,
  Loading,
  Money,
  Row,
  Screen,
  Small,
  Title,
} from '../../../src/components/ui';
import { useCompleteTrip, usePostTripExpenses, useTrip } from '../../../src/hooks/useTrips';
import { useOpenSettlementBatch, useTripLedger } from '../../../src/hooks/useLedger';
import { useCrewMembers } from '../../../src/hooks/useCrews';

export default function TripSettleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trip = useTrip(id);
  const ledger = useTripLedger(id);
  const post = usePostTripExpenses(id);
  const complete = useCompleteTrip(id);
  const crewId = trip.data?.trip.crew_id;
  const members = useCrewMembers(crewId ?? undefined);
  const openBatch = useOpenSettlementBatch(crewId ?? '');

  /**
   * Push any expense that has not reached the ledger before showing a number.
   * Posting is idempotent server-side, and the alternative is a settle screen
   * that confidently reports less money than the trip actually spent.
   */
  const postMutate = post.mutate;
  useEffect(() => {
    if (trip.data) postMutate();
  }, [postMutate, trip.data]);

  if (trip.isLoading || ledger.isLoading) return <Loading />;
  if (trip.error) return <ErrorNote error={trip.error} />;
  if (!trip.data || !ledger.data) return null;

  const name = (profileId: string) =>
    members.data?.find((m) => m.profileId === profileId)?.profile.display_name ?? 'Someone';
  const handleFor = (profileId: string) =>
    members.data?.find((m) => m.profileId === profileId)?.profile.handle;

  const { payments, positions, open } = ledger.data;
  const note = `${trip.data.trip.name} — settling up`;

  return (
    <Screen>
      <Title>Trip money</Title>
      <Small>
        Everything from the trip — rooms, expenses and every game — netted into the fewest payments.
      </Small>

      {post.data && post.data.unsettleable.length > 0 ? (
        <Card>
          <Heading>Some expenses cannot settle</Heading>
          <Small>
            {post.data.unsettleable.length} expense
            {post.data.unsettleable.length === 1 ? ' was' : 's were'} paid by a guest with nobody
            vouching for them, so there is no account to pay back. Add a voucher on the crew guests
            screen and reopen this.
          </Small>
        </Card>
      ) : null}

      <Card>
        <Heading>Where everyone stands</Heading>
        {positions.length === 0 ? (
          <Small>Nothing outstanding on this trip.</Small>
        ) : (
          positions.map((position) => (
            <Row key={position.profileId} justify="space-between">
              <Body>{name(position.profileId)}</Body>
              <Money cents={position.netCents} />
            </Row>
          ))
        )}
      </Card>

      <Card>
        <Heading>The smallest set of payments</Heading>
        {payments.length === 0 ? (
          <Small>Nothing to settle.</Small>
        ) : (
          <>
            {payments.map((payment, index) => (
              <Row key={index} justify="space-between">
                <Body>
                  {name(payment.fromProfile)} → {name(payment.toProfile)}
                </Body>
                <Row gap={8}>
                  <Small>{formatCents(payment.amountCents)}</Small>
                  <Button
                    title="Venmo"
                    variant="secondary"
                    onPress={() =>
                      void Linking.openURL(
                        venmoLink({
                          amountCents: payment.amountCents,
                          note,
                          handle: handleFor(payment.toProfile),
                        }),
                      )
                    }
                  />
                  <Button
                    title="Cash App"
                    variant="secondary"
                    onPress={() =>
                      void Linking.openURL(
                        cashAppLink({
                          amountCents: payment.amountCents,
                          note,
                          handle: handleFor(payment.toProfile),
                        }),
                      )
                    }
                  />
                </Row>
              </Row>
            ))}
            <Small>
              Halve never touches the money — these open your own payment app with the amount filled
              in.
            </Small>
            <Button
              title={`Request these ${payments.length} payments`}
              loading={openBatch.isPending}
              onPress={() => openBatch.mutate({ payments, tripId: id })}
            />
          </>
        )}
      </Card>

      {openBatch.error ? <ErrorNote error={openBatch.error} /> : null}

      <Divider />

      <Card>
        <Heading>Close the trip</Heading>
        <Small>
          {open.length > 0
            ? `${open.length} entries are still open. Settle them before closing.`
            : 'Everything is settled. Closing moves it to your history.'}
        </Small>
        {complete.error ? <ErrorNote error={complete.error} /> : null}
        <Button
          title="Mark the trip complete"
          variant="secondary"
          disabled={open.length > 0 || complete.isPending}
          onPress={() => complete.mutate()}
        />
      </Card>
    </Screen>
  );
}
