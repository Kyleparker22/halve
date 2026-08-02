import { Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { cashAppLink, venmoLink } from '@halve/ledger';
import {
  Body,
  Button,
  Card,
  ErrorNote,
  Heading,
  Loading,
  Money,
  Row,
  Screen,
  Small,
  Title,
} from '../../../src/components/ui';
import { useCrew, useCrewMembers } from '../../../src/hooks/useCrews';
import {
  useConfirmSettlement,
  useCrewLedger,
  useOpenSettlementBatch,
  useSettlements,
} from '../../../src/hooks/useLedger';
import { useSession } from '../../../src/hooks/useSession';

export default function SettleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const crew = useCrew(id);
  const ledger = useCrewLedger(id);
  const members = useCrewMembers(id);
  const settlements = useSettlements(id);
  const openBatch = useOpenSettlementBatch(id);
  const confirm = useConfirmSettlement(id);

  if (ledger.isLoading) return <Loading />;
  if (ledger.error) return <ErrorNote error={ledger.error} />;
  if (!ledger.data) return null;

  const name = (profileId: string) =>
    members.data?.find((m) => m.profileId === profileId)?.profile.display_name ?? 'Someone';
  const handleFor = (profileId: string) =>
    members.data?.find((m) => m.profileId === profileId)?.profile.handle;

  const pending = (settlements.data ?? []).filter((s) => s.status === 'requested');
  const note = `${crew.data?.name ?? 'Halve'} — settling up`;

  return (
    <Screen>
      <Title>Settle up</Title>

      {pending.length === 0 ? (
        <Card>
          <Heading>The smallest set of payments</Heading>
          {ledger.data.payments.length === 0 ? (
            <Small>Nothing outstanding.</Small>
          ) : (
            <>
              {ledger.data.payments.map((payment, i) => (
                <Row key={i} justify="space-between">
                  <Body numberOfLines={1}>
                    {name(payment.fromProfile)} pays {name(payment.toProfile)}
                  </Body>
                  <Money cents={payment.amountCents} size={15} />
                </Row>
              ))}
              <Small>
                {ledger.data.open.length} open {ledger.data.open.length === 1 ? 'entry' : 'entries'}{' '}
                closes in {ledger.data.payments.length}{' '}
                {ledger.data.payments.length === 1 ? 'payment' : 'payments'}.
              </Small>
              <Button
                title="Request these payments"
                loading={openBatch.isPending}
                onPress={() => openBatch.mutate({ payments: ledger.data!.payments })}
              />
            </>
          )}
        </Card>
      ) : (
        <Card>
          <Heading>Waiting on</Heading>
          <Small>
            Entries close only when every payment in the batch is confirmed — a partial batch stays
            open.
          </Small>
          {pending.map((settlement) => {
            const iOwe = settlement.from_profile === session?.user.id;
            return (
              <Card key={settlement.id}>
                <Row justify="space-between">
                  <Body>
                    {name(settlement.from_profile)} → {name(settlement.to_profile)}
                  </Body>
                  <Money cents={settlement.amount_cents} size={15} />
                </Row>
                {iOwe ? (
                  <>
                    <Button
                      title="Pay with Venmo"
                      onPress={() => {
                        const url = venmoLink({
                          amountCents: settlement.amount_cents,
                          note,
                          handle: handleFor(settlement.to_profile),
                        });
                        void Linking.canOpenURL(url).then((can) =>
                          can
                            ? Linking.openURL(url)
                            : Clipboard.setStringAsync(
                                `${(settlement.amount_cents / 100).toFixed(2)} — ${note}`,
                              ),
                        );
                      }}
                    />
                    <Button
                      title="Pay with Cash App"
                      variant="secondary"
                      onPress={() =>
                        void Linking.openURL(
                          cashAppLink({
                            amountCents: settlement.amount_cents,
                            note,
                            handle: handleFor(settlement.to_profile),
                          }),
                        )
                      }
                    />
                    <Button
                      title="Copy the amount"
                      variant="secondary"
                      onPress={() =>
                        void Clipboard.setStringAsync(
                          (settlement.amount_cents / 100).toFixed(2),
                        )
                      }
                    />
                  </>
                ) : null}
                <Button
                  title="Mark as paid"
                  variant="secondary"
                  onPress={() =>
                    confirm.mutate({ settlementId: settlement.id, method: 'venmo' })
                  }
                />
              </Card>
            );
          })}
        </Card>
      )}

      <Small>
        Halve never holds or moves money. It works out the amount and fills in the payment for you —
        you pay in your own app.
      </Small>
    </Screen>
  );
}
