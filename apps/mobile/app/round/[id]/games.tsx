import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { GameConfig, GameType } from '@halve/games';
import {
  Body,
  Button,
  Card,
  ErrorNote,
  Heading,
  Loading,
  Row,
  Screen,
  Small,
  Title,
} from '../../../src/components/ui';
import { useRoundBundle } from '../../../src/hooks/useRounds';
import { useCreateGame, useDeleteGame } from '../../../src/hooks/useGames';
import { useSession } from '../../../src/hooks/useSession';
import { radius, spacing, useTheme } from '../../../src/theme';

const TYPES: Array<{ type: GameType; label: string; blurb: string }> = [
  { type: 'nassau', label: 'Nassau', blurb: 'Front, back and total. Presses optional.' },
  { type: 'skins', label: 'Skins', blurb: 'Low score wins the hole. Ties carry.' },
  { type: 'match', label: 'Match', blurb: 'Head to head or two v two.' },
  { type: 'stroke', label: 'Stroke', blurb: 'Everyone antes, low score takes it.' },
  { type: 'bestball', label: 'Best ball', blurb: 'Teams, best ball each hole.' },
  { type: 'wolf', label: 'Wolf', blurb: 'Rotating wolf, lone and blind multipliers.' },
  { type: 'stableford', label: 'Stableford', blurb: 'Points against par, a dollar a point.' },
];

export default function GamesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { session } = useSession();
  const bundle = useRoundBundle(id);
  const create = useCreateGame(id);
  const remove = useDeleteGame(id);

  const [type, setType] = useState<GameType>('nassau');
  const [stake, setStake] = useState('20');
  const [net, setNet] = useState(true);
  const [allowance, setAllowance] = useState('100');
  const [lowMan, setLowMan] = useState(true);
  const [autoPress, setAutoPress] = useState(false);
  const [carryover, setCarryover] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [teamA, setTeamA] = useState<string[]>([]);

  if (bundle.isLoading) return <Loading />;
  if (bundle.error) return <ErrorNote error={bundle.error} />;
  if (!bundle.data) return null;

  const playing = bundle.data.roster.filter((p) => p.rsvp === 'in');
  const participants = selected.length > 0 ? selected : playing.map((p) => p.id);
  const needsTeams = type === 'match' || type === 'bestball';
  const stakeCents = Math.round(Number(stake || '0') * 100);

  const buildConfig = (): GameConfig => {
    const handicap = net
      ? ({ mode: 'net', allowancePct: Number(allowance || '100') } as const)
      : ({ mode: 'gross' } as const);
    const base = { stakeCents, handicap, lowManAdjustment: lowMan };

    switch (type) {
      case 'nassau':
        return {
          ...base,
          type: 'nassau',
          presses: autoPress ? { mode: 'auto', downBy: 2 } : { mode: 'none' },
          ...(needsTeamsFor(teamA, participants) ? { teams: teamsFrom(teamA, participants) } : {}),
        };
      case 'skins':
        return { ...base, type: 'skins', carryover, validation: false };
      case 'match':
        return { ...base, type: 'match', teams: teamsFrom(teamA, participants) };
      case 'bestball':
        return { ...base, type: 'bestball', teams: teamsFrom(teamA, participants) };
      case 'wolf':
        return {
          ...base,
          type: 'wolf',
          loneMultiplier: 2,
          blindMultiplier: 3,
          order: participants,
          // Filled in on the card as the wolf calls it, hole by hole.
          decisions: [],
        };
      case 'stableford':
        return { ...base, type: 'stableford' };
      case 'stroke':
      default:
        return { ...base, type: 'stroke' };
    }
  };

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <Screen>
      <Title>Games</Title>

      {bundle.data.games.map((game) => (
        <Card key={game.id}>
          <Row justify="space-between">
            <Body>{game.name ?? game.type}</Body>
            <Pressable onPress={() => remove.mutate(game.id)}>
              <Small>Remove</Small>
            </Pressable>
          </Row>
        </Card>
      ))}

      <Card>
        <Heading>Add a game</Heading>
        <Row wrap gap={spacing.sm}>
          {TYPES.map((option) => (
            <Pressable
              key={option.type}
              onPress={() => setType(option.type)}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radius.pill,
                backgroundColor: type === option.type ? theme.accent : theme.border,
              }}
            >
              <Body style={{ color: type === option.type ? theme.accentText : theme.text }}>
                {option.label}
              </Body>
            </Pressable>
          ))}
        </Row>
        <Small>{TYPES.find((t) => t.type === type)?.blurb}</Small>

        <Row justify="space-between">
          <Body>Stake ($)</Body>
          <TextInput
            value={stake}
            onChangeText={setStake}
            keyboardType="decimal-pad"
            selectTextOnFocus
            style={{
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: radius.sm,
              color: theme.text,
              paddingHorizontal: spacing.md,
              minWidth: 80,
              minHeight: 40,
              textAlign: 'right',
            }}
          />
        </Row>

        <Toggle label="Net (handicap strokes)" value={net} onChange={setNet} />
        {net ? (
          <>
            <Row justify="space-between">
              <Body>Allowance %</Body>
              <TextInput
                value={allowance}
                onChangeText={setAllowance}
                keyboardType="number-pad"
                selectTextOnFocus
                style={{
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: radius.sm,
                  color: theme.text,
                  paddingHorizontal: spacing.md,
                  minWidth: 80,
                  minHeight: 40,
                  textAlign: 'right',
                }}
              />
            </Row>
            <Toggle
              label="Low man plays off scratch"
              value={lowMan}
              onChange={setLowMan}
              hint="The club convention. Off means everyone plays their full handicap."
            />
          </>
        ) : null}

        {type === 'nassau' ? (
          <Toggle label="Auto-press at 2 down" value={autoPress} onChange={setAutoPress} />
        ) : null}
        {type === 'skins' ? (
          <Toggle label="Ties carry over" value={carryover} onChange={setCarryover} />
        ) : null}

        <Heading>Who&apos;s playing</Heading>
        {playing.map((player) => (
          <Row key={player.id} justify="space-between">
            <Pressable onPress={() => setSelected((s) => toggle(s, player.id))}>
              <Body>
                {participants.includes(player.id) ? '☑' : '☐'} {player.name}
              </Body>
            </Pressable>
            {needsTeams ? (
              <Pressable onPress={() => setTeamA((t) => toggle(t, player.id))}>
                <Small>{teamA.includes(player.id) ? 'Team A' : 'Team B'}</Small>
              </Pressable>
            ) : null}
          </Row>
        ))}

        <Button
          title="Add game"
          loading={create.isPending}
          disabled={stakeCents <= 0 || participants.length < 2}
          onPress={() =>
            create.mutate(
              {
                roundId: id,
                type,
                name: `${TYPES.find((t) => t.type === type)?.label} — $${stake}`,
                config: buildConfig(),
                participants: participants.map((roundPlayerId) => ({
                  roundPlayerId,
                  teamId: needsTeams ? (teamA.includes(roundPlayerId) ? 'A' : 'B') : undefined,
                })),
                createdBy: session!.user.id,
              },
              { onSuccess: () => router.back() },
            )
          }
        />
        {create.error ? <Small>{(create.error as Error).message}</Small> : null}
      </Card>
    </Screen>
  );
}

function needsTeamsFor(teamA: string[], participants: string[]): boolean {
  return teamA.length > 0 && teamA.length < participants.length;
}

function teamsFrom(teamA: string[], participants: string[]): Record<string, string[]> {
  if (!needsTeamsFor(teamA, participants)) {
    // Everyone for themselves.
    return Object.fromEntries(participants.map((id) => [id, [id]]));
  }
  return {
    A: participants.filter((id) => teamA.includes(id)),
    B: participants.filter((id) => !teamA.includes(id)),
  };
}

function Toggle({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  hint?: string;
}) {
  return (
    <View>
      <Pressable onPress={() => onChange(!value)} accessibilityRole="switch">
        <Body>
          {value ? '☑' : '☐'} {label}
        </Body>
      </Pressable>
      {hint ? <Small>{hint}</Small> : null}
    </View>
  );
}
