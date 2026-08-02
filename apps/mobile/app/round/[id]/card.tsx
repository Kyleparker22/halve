import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ErrorNote, Loading, Small } from '../../../src/components/ui';
import { useRoundBundle } from '../../../src/hooks/useRounds';
import { useScorecard } from '../../../src/hooks/useScorecard';
import { spacing, useTheme } from '../../../src/theme';

const CELL = 34;
const NAME = 96;

/** The traditional grid, as a secondary view. Hole-by-hole is the primary one. */
export default function FullCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const bundle = useRoundBundle(id);
  const card = useScorecard(bundle.data);

  if (bundle.isLoading) return <Loading />;
  if (bundle.error) return <ErrorNote error={bundle.error} />;
  if (!bundle.data) return null;

  const { holes, roster } = bundle.data;
  const players = roster.filter((p) => p.rsvp === 'in');

  const cell = (value: string | number, bold = false, muted = false) => (
    <View style={{ width: CELL, alignItems: 'center', paddingVertical: 6 }}>
      <Text
        style={{
          color: muted ? theme.muted : theme.text,
          fontWeight: bold ? '700' : '400',
          fontSize: 14,
        }}
      >
        {value}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['left', 'right', 'bottom']}>
      <ScrollView horizontal>
        <ScrollView>
          <View style={{ padding: spacing.md }}>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ width: NAME }}>
                <Small>Hole</Small>
              </View>
              {holes.map((hole) => (
                <View key={hole.number}>{cell(hole.number, true)}</View>
              ))}
              {cell('Tot', true)}
            </View>

            <View style={{ flexDirection: 'row' }}>
              <View style={{ width: NAME }}>
                <Small>Par</Small>
              </View>
              {holes.map((hole) => (
                <View key={hole.number}>{cell(hole.par, false, true)}</View>
              ))}
              {cell(
                holes.reduce((sum, hole) => sum + hole.par, 0),
                false,
                true,
              )}
            </View>

            <View style={{ flexDirection: 'row' }}>
              <View style={{ width: NAME }}>
                <Small>SI</Small>
              </View>
              {holes.map((hole) => (
                <View key={hole.number}>{cell(hole.strokeIndex, false, true)}</View>
              ))}
              {cell('', false, true)}
            </View>

            {players.map((player) => {
              const totals = card.totals.find((t) => t.roundPlayerId === player.id);
              return (
                <View key={player.id} style={{ flexDirection: 'row' }}>
                  <View style={{ width: NAME, justifyContent: 'center' }}>
                    <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14 }}>
                      {player.name}
                    </Text>
                  </View>
                  {holes.map((hole) => {
                    const entry = card.entry(player.id, hole.number);
                    const diff = entry.strokes === null ? 0 : entry.strokes - hole.par;
                    return (
                      <View
                        key={hole.number}
                        style={{
                          backgroundColor:
                            entry.strokes === null
                              ? 'transparent'
                              : diff < 0
                                ? `${theme.win}22`
                                : diff > 1
                                  ? `${theme.loss}22`
                                  : 'transparent',
                        }}
                      >
                        {cell(entry.strokes ?? '·', diff < 0)}
                      </View>
                    );
                  })}
                  {cell(totals?.gross ?? 0, true)}
                </View>
              );
            })}
          </View>
        </ScrollView>
      </ScrollView>
    </SafeAreaView>
  );
}
