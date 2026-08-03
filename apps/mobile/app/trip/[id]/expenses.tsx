import { useState } from 'react';
import { Pressable, TextInput } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { splitEvenly } from '@halve/ledger';
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
import { useAddExpense, useTrip, useTripExpenses } from '../../../src/hooks/useTrips';
import { Receipt } from '../../../src/components/Receipt';
import { radius, spacing, useTheme } from '../../../src/theme';

export default function ExpensesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const trip = useTrip(id);
  const expenses = useTripExpenses(id);
  const add = useAddExpense(id);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [shared, setShared] = useState<string[]>([]);

  if (trip.isLoading || expenses.isLoading) return <Loading />;
  if (trip.error) return <ErrorNote error={trip.error} />;
  if (!trip.data) return null;

  const members = trip.data.members;
  const nameFor = (memberId: string) => members.find((m) => m.id === memberId)?.name ?? 'Member';
  const shareWith =
    shared.length > 0 ? shared : members.filter((m) => m.status === 'in').map((m) => m.id);
  const cents = Math.round(Number(amount || '0') * 100);
  const preview = cents > 0 ? splitEvenly(cents, shareWith) : [];

  const input = {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.md,
    color: theme.text,
    padding: spacing.md,
    minHeight: 48,
  };

  // Per-person running position: what you paid, less what you owe.
  const positions = members.map((member) => {
    const paid = (expenses.data ?? [])
      .filter((expense) => expense.paid_by === member.id)
      .reduce((sum, expense) => sum + expense.amount_cents, 0);
    const owed = (expenses.data ?? [])
      .flatMap((expense) => expense.trip_expense_shares)
      .filter((share) => share.trip_member_id === member.id)
      .reduce((sum, share) => sum + share.amount_cents, 0);
    return { member, net: paid - owed };
  });

  return (
    <Screen>
      <Title>Expenses</Title>

      <Card>
        <Heading>Where everyone stands</Heading>
        {positions.map(({ member, net }) => (
          <Row key={member.id} justify="space-between">
            <Body>{member.name}</Body>
            <Money cents={net} size={15} />
          </Row>
        ))}
        <Small>
          Guests are charged like anyone else; their money resolves to whoever vouched for them.
        </Small>
      </Card>

      {(expenses.data ?? []).map((expense) => (
        <Card key={expense.id}>
          <Row justify="space-between">
            <Body>{expense.description}</Body>
            <Money cents={expense.amount_cents} size={15} />
          </Row>
          <Small>
            {nameFor(expense.paid_by)} paid · split {expense.trip_expense_shares.length} ways
            {expense.room_id ? ' · from a room' : ''}
          </Small>
          {/* Room expenses are generated from the room's cost — there is no
              receipt to attach and offering one would be confusing. */}
          {expense.room_id ? null : (
            <Receipt tripId={id} expenseId={expense.id} receiptPath={expense.receipt_url} />
          )}
        </Card>
      ))}

      <Card>
        <Heading>Add an expense</Heading>
        <TextInput
          style={input}
          value={description}
          onChangeText={setDescription}
          placeholder="Sunday greens fees"
          placeholderTextColor={theme.muted}
        />
        <TextInput
          style={input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          selectTextOnFocus
          placeholder="840.00"
          placeholderTextColor={theme.muted}
        />
        <Small>Who paid</Small>
        <Row wrap gap={spacing.sm}>
          {members.map((member) => (
            <Pressable key={member.id} onPress={() => setPaidBy(member.id)}>
              <Body style={{ color: paidBy === member.id ? theme.accent : theme.text }}>
                {member.name}
              </Body>
            </Pressable>
          ))}
        </Row>
        <Small>Split between</Small>
        <Row wrap gap={spacing.sm}>
          {members.map((member) => (
            <Pressable
              key={member.id}
              onPress={() =>
                setShared((list) =>
                  list.includes(member.id)
                    ? list.filter((v) => v !== member.id)
                    : [...list, member.id],
                )
              }
            >
              <Body style={{ color: shareWith.includes(member.id) ? theme.accent : theme.muted }}>
                {member.name}
              </Body>
            </Pressable>
          ))}
        </Row>
        {preview.length > 0 ? (
          <Small>
            {preview
              .map(
                (share) =>
                  `${nameFor(share.tripMemberId)} $${(share.amountCents / 100).toFixed(2)}`,
              )
              .join(' · ')}
          </Small>
        ) : null}
        <Button
          title="Add expense"
          disabled={!paidBy || cents <= 0 || description.trim().length === 0}
          loading={add.isPending}
          onPress={() =>
            add.mutate(
              {
                description: description.trim(),
                amountCents: cents,
                paidByMemberId: paidBy!,
                shareMemberIds: shareWith,
              },
              {
                onSuccess: () => {
                  setDescription('');
                  setAmount('');
                  setShared([]);
                },
              },
            )
          }
        />
        {add.error ? <Small>{(add.error as Error).message}</Small> : null}
      </Card>
    </Screen>
  );
}
