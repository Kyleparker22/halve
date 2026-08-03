import { Pressable, Text, TextInput, View } from 'react-native';
import type { HoleDraft } from '../hooks/useRounds';
import { Body, Card, Heading, Row, Small } from './ui';
import { radius, spacing, useTheme } from '../theme';

/**
 * Par and stroke index, hole by hole. Used both for adding a course by hand and
 * for correcting one whose provider data was incomplete.
 *
 * Stroke index is the field that matters: allocation is by index, so a wrong or
 * duplicated one moves real money. The editor validates that the set is a
 * permutation before it will let you save, matching the database check.
 */
export function HoleCardEditor({
  holes,
  onChange,
}: {
  holes: HoleDraft[];
  onChange: (next: HoleDraft[]) => void;
}) {
  const theme = useTheme();

  const set = (number: number, patch: Partial<HoleDraft>) =>
    onChange(holes.map((hole) => (hole.number === number ? { ...hole, ...patch } : hole)));

  const indexes = holes.map((h) => h.stroke_index).sort((a, b) => a - b);
  const expected = holes.map((_, i) => i + 1);
  const indexesValid = indexes.every((value, i) => value === expected[i]);
  const outPar = holes.filter((h) => h.number <= 9).reduce((sum, h) => sum + h.par, 0);
  const inPar = holes.filter((h) => h.number > 9).reduce((sum, h) => sum + h.par, 0);

  return (
    <Card>
      <Row justify="space-between">
        <Heading>The card</Heading>
        <Small>
          {holes.length === 18 ? `out ${outPar} · in ${inPar} · ` : ''}par {outPar + inPar}
        </Small>
      </Row>

      <Row justify="space-between">
        <Small>Hole</Small>
        <Row gap={spacing.lg}>
          <Small>Par</Small>
          <Small>Stroke index</Small>
        </Row>
      </Row>

      {holes.map((hole) => (
        <Row key={hole.number} justify="space-between">
          <Body>{hole.number}</Body>
          <Row gap={spacing.lg}>
            <Row gap={spacing.sm}>
              <Pressable
                accessibilityLabel={`decrease par on ${hole.number}`}
                onPress={() => set(hole.number, { par: Math.max(3, hole.par - 1) })}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: radius.sm,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.border,
                }}
              >
                <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>−</Text>
              </Pressable>
              <View style={{ minWidth: 20, alignItems: 'center' }}>
                <Body>{hole.par}</Body>
              </View>
              <Pressable
                accessibilityLabel={`increase par on ${hole.number}`}
                onPress={() => set(hole.number, { par: Math.min(6, hole.par + 1) })}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: radius.sm,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.border,
                }}
              >
                <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>+</Text>
              </Pressable>
            </Row>

            <TextInput
              accessibilityLabel={`stroke index for hole ${hole.number}`}
              value={String(hole.stroke_index)}
              onChangeText={(text) => {
                const value = Number(text.replace(/[^0-9]/g, ''));
                set(hole.number, {
                  stroke_index: Number.isFinite(value) ? value : hole.stroke_index,
                });
              }}
              keyboardType="number-pad"
              selectTextOnFocus
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: radius.sm,
                color: theme.text,
                minWidth: 52,
                minHeight: 34,
                textAlign: 'center',
                paddingHorizontal: spacing.sm,
              }}
            />
          </Row>
        </Row>
      ))}

      {!indexesValid ? (
        <Small style={{ color: theme.loss }}>
          Stroke indexes must be 1 to {holes.length}, each used once. Net games allocate strokes by
          index, so a duplicate moves real money.
        </Small>
      ) : null}
    </Card>
  );
}

/** A blank card: pars at 4, indexes in hole order, ready to be corrected. */
export function blankCard(holeCount: 9 | 18): HoleDraft[] {
  return Array.from({ length: holeCount }, (_, i) => ({
    number: i + 1,
    par: 4,
    stroke_index: i + 1,
  }));
}

export function cardIsValid(holes: HoleDraft[]): boolean {
  const sorted = holes.map((h) => h.stroke_index).sort((a, b) => a - b);
  return sorted.every((value, i) => value === i + 1);
}
