import { Pressable, View } from 'react-native';
import type { WolfConfig } from '@halve/games';
import type { RosterEntry } from '@halve/types';
import { Body, Card, Heading, Row, Small } from './ui';
import { useSetWolfDecision } from '../hooks/useGames';
import { radius, spacing, useTheme } from '../theme';

/**
 * Records who the wolf took, on the hole, while it is still being argued about
 * on the tee. Without this the engine has nothing to settle and says so.
 */
export function WolfPicker({
  roundId,
  gameId,
  config,
  roster,
  hole,
}: {
  roundId: string;
  gameId: string;
  config: WolfConfig;
  roster: RosterEntry[];
  hole: number;
}) {
  const theme = useTheme();
  const setDecision = useSetWolfDecision(roundId);

  const order = (config.order ?? roster.map((p) => p.id)).filter((id) =>
    roster.some((p) => p.id === id),
  );
  if (order.length < 3) return null;

  const holeIndex = Math.max(0, hole - 1);
  const wolfId = order[holeIndex % order.length]!;
  const wolf = roster.find((p) => p.id === wolfId);
  const current = config.decisions.find((d) => d.hole === hole);

  const choose = (decision: Parameters<typeof setDecision.mutate>[0]['decision']) =>
    setDecision.mutate({ gameId, config, decision });

  const chip = (label: string, active: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityRole="button"
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.pill,
        backgroundColor: active ? theme.accent : theme.border,
      }}
    >
      <Body style={{ color: active ? theme.accentText : theme.text }}>{label}</Body>
    </Pressable>
  );

  return (
    <Card>
      <Row justify="space-between">
        <Heading>{wolf?.name ?? 'Wolf'} is the wolf</Heading>
        {!current ? <Small>not called yet</Small> : null}
      </Row>
      <View style={{ gap: spacing.sm }}>
        <Row wrap gap={spacing.sm}>
          {roster
            .filter((player) => player.id !== wolfId)
            .map((player) =>
              chip(
                player.name,
                current?.partnerRoundPlayerId === player.id,
                () => choose({ hole, partnerRoundPlayerId: player.id }),
              ),
            )}
        </Row>
        <Row wrap gap={spacing.sm}>
          {chip(`Lone (${config.loneMultiplier}×)`, current?.lone === 'lone', () =>
            choose({ hole, lone: 'lone' }),
          )}
          {chip(`Blind (${config.blindMultiplier}×)`, current?.lone === 'blind', () =>
            choose({ hole, lone: 'blind' }),
          )}
        </Row>
      </View>
      <Small>
        Blind is called before the tee shots, lone after. Either way the wolf plays the field alone.
      </Small>
    </Card>
  );
}
