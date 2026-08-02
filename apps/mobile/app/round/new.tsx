import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { courseHandicap, playingHandicap } from '@halve/games';
import { Body, Button, Card, Heading, Row, Screen, Small, Title } from '../../src/components/ui';
import { useCourseSearch, useCreateRound } from '../../src/hooks/useRounds';
import { useCrewGuests, useCrewMembers, useCrews } from '../../src/hooks/useCrews';
import { useSession } from '../../src/hooks/useSession';
import { radius, spacing, useTheme } from '../../src/theme';

export default function NewRoundScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const crews = useCrews(session?.user.id);
  const create = useCreateRound();

  const [crewId, setCrewId] = useState<string | null>(null);
  const [term, setTerm] = useState('');
  const [courseId, setCourseId] = useState<string | null>(null);
  const [teeId, setTeeId] = useState<string | null>(null);
  const [when, setWhen] = useState(defaultTeeTime());
  const [holeCount, setHoleCount] = useState<9 | 18>(18);
  const [openSeats, setOpenSeats] = useState(false);
  const [invited, setInvited] = useState<string[]>([]);
  const [guests, setGuests] = useState<string[]>([]);

  const courses = useCourseSearch(term);
  const members = useCrewMembers(crewId ?? undefined);
  const crewGuests = useCrewGuests(crewId ?? undefined);
  const course = (courses.data ?? []).find((c) => c.id === courseId);
  const tee = course?.tees.find((t) => t.id === teeId);

  const input = {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.md,
    color: theme.text,
    padding: spacing.md,
    minHeight: 48,
  };

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <Screen>
      <Title>Schedule a round</Title>

      <Card>
        <Heading>Crew</Heading>
        <Row wrap gap={spacing.sm}>
          {(crews.data ?? []).map((crew) => (
            <Pressable key={crew.id} onPress={() => setCrewId(crew.id)}>
              <Body style={{ color: crewId === crew.id ? theme.accent : theme.text }}>
                {crew.name}
              </Body>
            </Pressable>
          ))}
        </Row>
      </Card>

      <Card>
        <Heading>Course</Heading>
        <TextInput
          style={input}
          value={term}
          onChangeText={setTerm}
          placeholder="Search — Innisbrook, Bethpage…"
          placeholderTextColor={theme.muted}
        />
        {(courses.data ?? []).slice(0, 6).map((result) => (
          <Pressable
            key={result.id}
            onPress={() => {
              setCourseId(result.id);
              setTeeId(result.tees[0]?.id ?? null);
            }}
          >
            <Row justify="space-between">
              <Body style={{ color: courseId === result.id ? theme.accent : theme.text }}>
                {result.name}
              </Body>
              <Small>
                {result.city}
                {result.state ? `, ${result.state}` : ''}
              </Small>
            </Row>
          </Pressable>
        ))}
        {course ? (
          <Row wrap gap={spacing.sm}>
            {course.tees.map((option) => (
              <Pressable key={option.id} onPress={() => setTeeId(option.id)}>
                <Small style={{ color: teeId === option.id ? theme.accent : theme.muted }}>
                  {option.name} · {option.par} · {option.rating}/{option.slope}
                </Small>
              </Pressable>
            ))}
          </Row>
        ) : null}
        {course?.needs_review ? (
          <Small>
            This course is missing stroke indexes from the provider. Net games need them — you can
            correct them on the card.
          </Small>
        ) : null}
      </Card>

      <Card>
        <Heading>When</Heading>
        <TextInput
          style={input}
          value={when}
          onChangeText={setWhen}
          placeholder="2026-08-08T08:40"
          placeholderTextColor={theme.muted}
        />
        <Small>Local time at the course. Stored with the course&apos;s timezone.</Small>
        <Row gap={spacing.sm}>
          <Pressable onPress={() => setHoleCount(18)}>
            <Body style={{ color: holeCount === 18 ? theme.accent : theme.text }}>18 holes</Body>
          </Pressable>
          <Pressable onPress={() => setHoleCount(9)}>
            <Body style={{ color: holeCount === 9 ? theme.accent : theme.text }}>9 holes</Body>
          </Pressable>
        </Row>
      </Card>

      {crewId ? (
        <Card>
          <Heading>Who&apos;s invited</Heading>
          {(members.data ?? []).map((member) => {
            const index = member.profile.handicap_index;
            const projected =
              index !== null && tee?.rating && tee?.slope
                ? playingHandicap(
                    courseHandicap({
                      index,
                      slope: tee.slope,
                      rating: tee.rating,
                      par: tee.par,
                      holeCount,
                    }),
                  )
                : null;
            return (
              <Pressable
                key={member.profileId}
                onPress={() => setInvited((list) => toggle(list, member.profileId))}
              >
                <Row justify="space-between">
                  <Body>
                    {invited.includes(member.profileId) ? '☑' : '☐'} {member.profile.display_name}
                  </Body>
                  <Small>{projected !== null ? `plays off ${projected}` : '—'}</Small>
                </Row>
              </Pressable>
            );
          })}
          {(crewGuests.data ?? []).length > 0 ? <Small>Guests</Small> : null}
          {(crewGuests.data ?? []).map((guest) => (
            <Pressable key={guest.id} onPress={() => setGuests((list) => toggle(list, guest.id))}>
              <Body>
                {guests.includes(guest.id) ? '☑' : '☐'} {guest.name}
              </Body>
            </Pressable>
          ))}
          <Pressable onPress={() => setOpenSeats((v) => !v)}>
            <View>
              <Body>{openSeats ? '☑' : '☐'} Offer the empty seats</Body>
              <Small>
                Visible to your crews&apos; crews only — two hops, never public, always with the
                connection shown.
              </Small>
            </View>
          </Pressable>
        </Card>
      ) : null}

      <Button
        title="Schedule it"
        disabled={!crewId || !courseId}
        loading={create.isPending}
        onPress={() =>
          create.mutate(
            {
              crewId: crewId!,
              courseId: courseId!,
              teeId,
              scheduledAt: new Date(when).toISOString(),
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              holeCount,
              maxPlayers: Math.max(4, invited.length + guests.length),
              openSeats,
              createdBy: session!.user.id,
              profileIds: Array.from(new Set([session!.user.id, ...invited])),
              guestIds: guests,
            },
            { onSuccess: (round) => router.replace(`/round/${round.id}`) },
          )
        }
      />
      {create.error ? <Small>{(create.error as Error).message}</Small> : null}
    </Screen>
  );
}

function defaultTeeTime(): string {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  date.setHours(8, 40, 0, 0);
  return date.toISOString().slice(0, 16);
}
