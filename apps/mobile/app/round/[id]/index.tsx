import { Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Body,
  Button,
  Card,
  Divider,
  ErrorNote,
  Heading,
  Loading,
  Pill,
  Row,
  Screen,
  Small,
  Title,
} from '../../../src/components/ui';
import { useRoundBundle, useRsvp, useStartRound } from '../../../src/hooks/useRounds';
import { useSession } from '../../../src/hooks/useSession';
import { useApproveSeat, useSeatRequests } from '../../../src/hooks/useSocial';

export default function RoundScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const bundle = useRoundBundle(id);
  const rsvp = useRsvp(id);
  const start = useStartRound(id);
  const requests = useSeatRequests(id);
  const approve = useApproveSeat(id);

  if (bundle.isLoading) return <Loading />;
  if (bundle.error) return <ErrorNote error={bundle.error} />;
  if (!bundle.data) return null;

  const { round, roster, courseName, teeName, games } = bundle.data;
  const me = roster.find((p) => p.profileId === session?.user.id);
  const inCount = roster.filter((p) => p.rsvp === 'in').length;
  const openSeats = (round.max_players ?? 4) - inCount;

  return (
    <Screen>
      <Title onPress={() => round.course_id && router.push(`/course/${round.course_id}`)}>
        {courseName}
      </Title>
      <Small>
        {new Date(round.scheduled_at).toLocaleString(undefined, { timeZone: round.timezone })} ·{' '}
        {round.hole_count} holes{teeName ? ` · ${teeName} tees` : ''}
      </Small>

      {round.status === 'completed' ? (
        <Button title="See the recap" onPress={() => router.push(`/round/${id}/recap`)} />
      ) : (
        <Button
          title={round.status === 'in_progress' ? 'Open the card' : 'Start the round'}
          onPress={() => {
            if (round.status !== 'in_progress') start.mutate();
            router.push(`/round/${id}/score`);
          }}
        />
      )}

      {me && round.status === 'scheduled' ? (
        <Card>
          <Heading>Are you in?</Heading>
          <Row gap={8}>
            {(['in', 'maybe', 'out'] as const).map((state) => (
              <Button
                key={state}
                title={state}
                variant={me.rsvp === state ? 'primary' : 'secondary'}
                onPress={() => rsvp.mutate({ roundPlayerId: me.id, rsvp: state })}
              />
            ))}
          </Row>
        </Card>
      ) : null}

      <Card>
        <Row justify="space-between">
          <Heading>Roster</Heading>
          <Row gap={8}>
            <Small>
              {inCount} in{openSeats > 0 ? ` · ${openSeats} open` : ''}
            </Small>
            {round.status !== 'completed' ? (
              <Button
                title="Edit"
                variant="secondary"
                onPress={() => router.push(`/round/${id}/roster`)}
              />
            ) : null}
          </Row>
        </Row>
        {roster.map((player) => (
          <Row key={player.id} justify="space-between">
            <Row gap={6}>
              <Body>{player.name}</Body>
              {player.isGuest ? <Pill label="guest" /> : null}
            </Row>
            <Small>
              {player.rsvp}
              {player.playingHandicap !== null ? ` · plays off ${player.playingHandicap}` : ''}
            </Small>
          </Row>
        ))}
      </Card>

      {(requests.data ?? []).length > 0 ? (
        <Card>
          <Heading>Seat requests</Heading>
          {(requests.data ?? []).map((request) => (
            <Row key={request.id} justify="space-between">
              <Body>{request.profiles.display_name}</Body>
              <Button
                title="Approve"
                variant="secondary"
                onPress={() => approve.mutate(request.id)}
              />
            </Row>
          ))}
        </Card>
      ) : null}

      <Card>
        <Row justify="space-between">
          <Heading>Games</Heading>
          <Button
            title="Add"
            variant="secondary"
            onPress={() => router.push(`/round/${id}/games`)}
          />
        </Row>
        {games.length === 0 ? (
          <Small>No games yet. Nassau and skins take about ten seconds to set up.</Small>
        ) : (
          games.map((game) => (
            <Row key={game.id} justify="space-between">
              <Body>{game.name ?? game.type}</Body>
              <Small>
                {'stakeCents' in game.config ? `$${(game.config.stakeCents / 100).toFixed(0)}` : ''}{' '}
                · {game.config.handicap.mode}
              </Small>
            </Row>
          ))
        )}
      </Card>

      {/* The booth is the thing no other golf app has — it gets a card that
          says what it is, not a bare button below the utilities. */}
      <Card>
        <Heading>The broadcast booth</Heading>
        <Small>
          Hal and Marcy call your round. Send clips from the course and they commentate — off the
          real scores and whatever dirt the crew gave them.
        </Small>
        <Row gap={8}>
          <Button title="Open the booth" onPress={() => router.push(`/round/${id}/booth`)} />
          {round.status === 'scheduled' ? (
            <Button
              title="Give them dirt"
              variant="secondary"
              onPress={() => router.push(`/round/${id}/storylines`)}
            />
          ) : null}
        </Row>
      </Card>

      <Divider />

      <Button
        title="Round chat"
        variant="secondary"
        onPress={() => router.push(`/chat/round/${id}`)}
      />
      <Button
        title="Find a tee time"
        variant="secondary"
        onPress={() =>
          void Linking.openURL(
            round.booking_url ??
              `https://www.golfnow.com/tee-times/search?q=${encodeURIComponent(courseName)}`,
          )
        }
      />
    </Screen>
  );
}
