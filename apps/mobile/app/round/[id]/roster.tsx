import { useState } from 'react';
import { Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { courseHandicap, playingHandicap } from '@halve/games';
import {
  Body,
  Button,
  Card,
  ErrorNote,
  Heading,
  Loading,
  Pill,
  Row,
  Screen,
  Small,
  Title,
} from '../../../src/components/ui';
import {
  useAddRoundPlayers,
  useRemoveRoundPlayer,
  useRoundBundle,
} from '../../../src/hooks/useRounds';
import { useCrewGuests, useCrewMembers } from '../../../src/hooks/useCrews';
import { spacing, useTheme } from '../../../src/theme';

export default function RosterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const bundle = useRoundBundle(id);
  const add = useAddRoundPlayers(id);
  const remove = useRemoveRoundPlayer(id);

  const [picked, setPicked] = useState<string[]>([]);
  const [pickedGuests, setPickedGuests] = useState<string[]>([]);

  const crewId = bundle.data?.round.crew_id ?? undefined;
  const members = useCrewMembers(crewId);
  const guests = useCrewGuests(crewId);

  if (bundle.isLoading) return <Loading />;
  if (bundle.error) return <ErrorNote error={bundle.error} />;
  if (!bundle.data) return null;

  const { round, roster, tee } = bundle.data;
  const onRoster = new Set(roster.map((p) => p.profileId).filter(Boolean));
  const guestsOnRoster = new Set(roster.map((p) => p.guestId).filter(Boolean));

  const available = (members.data ?? []).filter((m) => !onRoster.has(m.profileId));
  const availableGuests = (guests.data ?? []).filter((g) => !guestsOnRoster.has(g.id));

  /** Same computation the scheduler ran — see Technical Spec §5.1. */
  const handicapFor = (index: number | null): number | null =>
    index !== null && tee?.rating && tee?.slope
      ? playingHandicap(
          courseHandicap({
            index,
            slope: tee.slope,
            rating: tee.rating,
            par: tee.par,
            holeCount: round.hole_count as 9 | 18,
          }),
        )
      : null;

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const submit = () => {
    add.mutate(
      {
        profileIds: picked,
        guestIds: pickedGuests,
        playingHandicaps: Object.fromEntries(
          (members.data ?? []).map((m) => [m.profileId, handicapFor(m.profile.handicap_index)]),
        ),
      },
      {
        onSuccess: () => {
          setPicked([]);
          setPickedGuests([]);
        },
      },
    );
  };

  return (
    <Screen>
      <Title>Roster</Title>
      <Small>
        {round.status === 'scheduled'
          ? 'Add anyone who said yes late. Take someone off before the first score goes in.'
          : 'The round has started. Players who have scored cannot be removed.'}
      </Small>

      <Card>
        <Heading>Playing</Heading>
        {roster.map((player) => (
          <Row key={player.id} justify="space-between">
            <Row gap={6}>
              <Body>{player.name}</Body>
              {player.isGuest ? <Pill label="guest" /> : null}
            </Row>
            <Row gap={spacing.sm}>
              <Small>{player.rsvp}</Small>
              <Button
                title="Remove"
                variant="secondary"
                onPress={() => remove.mutate(player.id)}
              />
            </Row>
          </Row>
        ))}
      </Card>

      {/* The database refuses to remove anyone who has scored, because the
          cascade would take their game results with them. Show its reason
          rather than a generic failure — "they have already scored" is
          actionable, "something went wrong" is not. */}
      {remove.error ? <ErrorNote error={remove.error} /> : null}

      <Card>
        <Heading>Add from the crew</Heading>
        {available.length === 0 ? (
          <Small>Everyone in this crew is already on the roster.</Small>
        ) : (
          available.map((member) => (
            <Pressable key={member.profileId} onPress={() => setPicked(toggle(picked, member.profileId))}>
              <Row justify="space-between">
                <Body
                  style={{ color: picked.includes(member.profileId) ? theme.accent : theme.text }}
                >
                  {member.profile.display_name}
                </Body>
                <Small>
                  {handicapFor(member.profile.handicap_index) !== null
                    ? `plays off ${handicapFor(member.profile.handicap_index)}`
                    : 'no index'}
                </Small>
              </Row>
            </Pressable>
          ))
        )}
      </Card>

      {availableGuests.length > 0 ? (
        <Card>
          <Heading>Guests</Heading>
          {availableGuests.map((guest) => (
            <Pressable key={guest.id} onPress={() => setPickedGuests(toggle(pickedGuests, guest.id))}>
              <Body style={{ color: pickedGuests.includes(guest.id) ? theme.accent : theme.text }}>
                {guest.name}
              </Body>
            </Pressable>
          ))}
        </Card>
      ) : null}

      {add.error ? <ErrorNote error={add.error} /> : null}

      <Button
        title={
          picked.length + pickedGuests.length === 0
            ? 'Add to the round'
            : `Add ${picked.length + pickedGuests.length} to the round`
        }
        disabled={picked.length + pickedGuests.length === 0 || add.isPending}
        onPress={submit}
      />
    </Screen>
  );
}
