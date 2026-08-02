import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { useCrewMembers } from '../../../src/hooks/useCrews';
import { useAddManualEntry, useCrewLedger, useReverseEntry } from '../../../src/hooks/useLedger';
import { radius, spacing, useTheme } from '../../../src/theme';

export default function LedgerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const ledger = useCrewLedger(id);
  const members = useCrewMembers(id);
  const addEntry = useAddManualEntry(id);
  const reverse = useReverseEntry(id);

  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);

  if (ledger.isLoading) return <Loading />;
  if (ledger.error) return <ErrorNote error={ledger.error} />;
  if (!ledger.data) return null;

  const name = (profileId: string) =>
    members.data?.find((m) => m.profileId === profileId)?.profile.display_name ?? 'Someone';

  const input = {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.sm,
    color: theme.text,
    padding: spacing.md,
    minHeight: 44,
  };

  return (
    <Screen>
      <Title>Ledger</Title>

      <Card>
        <Heading>Where everyone stands</Heading>
        {ledger.data.positions.length === 0 ? (
          <Small>All square. Nobody owes anybody.</Small>
        ) : (
          ledger.data.positions.map((position) => (
            <Row key={position.profileId} justify="space-between">
              <Body>{name(position.profileId)}</Body>
              <Money cents={position.netCents} />
            </Row>
          ))
        )}
      </Card>

      {ledger.data.matrix.length > 0 ? (
        <Card>
          <Heading>Who owes who</Heading>
          {ledger.data.matrix.map((pair, i) => (
            <Row key={`${pair.fromProfile}-${pair.toProfile}-${i}`} justify="space-between">
              <Body numberOfLines={1}>
                {name(pair.fromProfile)} → {name(pair.toProfile)}
              </Body>
              <Money cents={pair.amountCents} size={15} />
            </Row>
          ))}
          <Button
            title={`Settle in ${ledger.data.payments.length} payment${
              ledger.data.payments.length === 1 ? '' : 's'
            }`}
            onPress={() => router.push(`/crew/${id}/settle`)}
          />
        </Card>
      ) : null}

      <Card>
        <Heading>Every entry</Heading>
        {ledger.data.entries.map((entry) => (
          <View key={entry.id} style={{ gap: 2 }}>
            <Row justify="space-between">
              <Body numberOfLines={1}>
                {entry.from?.display_name ?? 'Someone'} → {entry.to?.display_name ?? 'someone'}
              </Body>
              <Money cents={entry.amount_cents} size={15} />
            </Row>
            <Row justify="space-between">
              <Small>
                {entry.note ?? entry.source_type} · {entry.status}
              </Small>
              {entry.status === 'open' ? (
                <Small onPress={() => reverse.mutate(entry)}>reverse</Small>
              ) : null}
            </Row>
            <Divider />
          </View>
        ))}
      </Card>

      <Card>
        <Heading>Add an entry</Heading>
        <Small>
          For the things that happen off the card — someone bought lunch, someone covered a cart.
        </Small>
        <TextInput
          style={input}
          value={note}
          onChangeText={setNote}
          placeholder="Lunch at the turn"
          placeholderTextColor={theme.muted}
        />
        <TextInput
          style={input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="18.00"
          placeholderTextColor={theme.muted}
        />
        <Small>Who owes</Small>
        <Row wrap gap={spacing.sm}>
          {(members.data ?? []).map((member) => (
            <Body
              key={member.profileId}
              onPress={() => setFrom(member.profileId)}
              style={{ color: from === member.profileId ? theme.accent : theme.text }}
            >
              {member.profile.display_name}
            </Body>
          ))}
        </Row>
        <Small>Who is owed</Small>
        <Row wrap gap={spacing.sm}>
          {(members.data ?? []).map((member) => (
            <Body
              key={member.profileId}
              onPress={() => setTo(member.profileId)}
              style={{ color: to === member.profileId ? theme.accent : theme.text }}
            >
              {member.profile.display_name}
            </Body>
          ))}
        </Row>
        <Button
          title="Add to the ledger"
          disabled={!from || !to || from === to || Number(amount) <= 0}
          loading={addEntry.isPending}
          onPress={() =>
            addEntry.mutate(
              {
                fromProfile: from!,
                toProfile: to!,
                amountCents: Math.round(Number(amount) * 100),
                note: note.trim() || 'Manual entry',
              },
              {
                onSuccess: () => {
                  setNote('');
                  setAmount('');
                },
              },
            )
          }
        />
      </Card>
    </Screen>
  );
}
