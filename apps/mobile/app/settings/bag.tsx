import { useState } from 'react';
import { Pressable, TextInput } from 'react-native';
import {
  Body,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Heading,
  Loading,
  Row,
  Screen,
  Small,
  Title,
} from '../../src/components/ui';
import { useClubs, useRemoveClub, useSaveClub } from '../../src/hooks/useClubs';
import { useSession } from '../../src/hooks/useSession';
import { radius, spacing, useTheme } from '../../src/theme';

/** A typical bag, offered so nobody has to type fourteen rows from scratch. */
const STARTERS = ['Dr', '3w', '5w', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW'];

export default function BagScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const clubs = useClubs(session?.user.id);
  const save = useSaveClub(session?.user.id);
  const remove = useRemoveClub(session?.user.id);

  const [name, setName] = useState('');
  const [yards, setYards] = useState('');

  if (clubs.isLoading) return <Loading />;
  if (clubs.error) return <ErrorNote error={clubs.error} />;

  const bag = clubs.data ?? [];
  const used = new Set(bag.map((c) => c.name));
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
      <Title>Your bag</Title>
      <Small>
        Stock carry, not your best ever. The number you hit it seven times out of ten — a bag full
        of career shots recommends clubs you cannot hit.
      </Small>

      {bag.length === 0 ? (
        <EmptyState
          title="Nothing in the bag yet"
          hint="Add a few clubs and Bagdrop will suggest one from the fairway, adjusted for wind, elevation and temperature."
        />
      ) : (
        <Card>
          <Heading>In the bag</Heading>
          {bag.map((club) => (
            <Row key={club.id} justify="space-between">
              <Body>{club.name}</Body>
              <Row gap={spacing.md}>
                <Small>{club.carryYards} yds</Small>
                <Pressable onPress={() => remove.mutate(club.id)}>
                  <Small>remove</Small>
                </Pressable>
              </Row>
            </Row>
          ))}
        </Card>
      )}

      <Card>
        <Heading>Add a club</Heading>
        <Row wrap gap={spacing.sm}>
          {STARTERS.filter((s) => !used.has(s)).map((starter) => (
            <Pressable key={starter} onPress={() => setName(starter)}>
              <Body style={{ color: name === starter ? theme.accent : theme.muted }}>{starter}</Body>
            </Pressable>
          ))}
        </Row>
        <Row gap={spacing.sm}>
          <TextInput
            style={[input, { flex: 1 }]}
            value={name}
            onChangeText={setName}
            maxLength={24}
            placeholder="7i"
            placeholderTextColor={theme.muted}
          />
          <TextInput
            style={[input, { width: 110 }]}
            value={yards}
            onChangeText={setYards}
            keyboardType="number-pad"
            placeholder="Carry"
            placeholderTextColor={theme.muted}
          />
        </Row>
        {save.error ? <ErrorNote error={save.error} /> : null}
        <Button
          title={used.has(name.trim()) ? 'Update it' : 'Add it'}
          disabled={
            name.trim().length === 0 ||
            !Number(yards) ||
            Number(yards) < 30 ||
            Number(yards) > 400 ||
            save.isPending
          }
          onPress={() =>
            save.mutate(
              { name, carryYards: Number(yards) },
              {
                onSuccess: () => {
                  setName('');
                  setYards('');
                },
              },
            )
          }
        />
      </Card>

      <Small>
        Only you can see this. Club distances are a mildly embarrassing thing to have visible to the
        crew, so they are not.
      </Small>
    </Screen>
  );
}
