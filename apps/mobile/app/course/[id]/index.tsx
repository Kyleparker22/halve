import { useLocalSearchParams, useRouter } from 'expo-router';
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
} from '../../../src/components/ui';
import { useCourseHistory } from '../../../src/hooks/useCourseHistory';

export default function CourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const history = useCourseHistory(id);

  if (history.isLoading) return <Loading />;
  if (history.error) return <ErrorNote error={history.error} />;
  if (!history.data) return null;

  const { courseName, city, state, roundsPlayed, regulars, lowRound, hardestHole, holes } =
    history.data;

  const owned = holes.filter((hole) => hole.ownedBy !== null);

  return (
    <Screen>
      <Title>{courseName}</Title>
      <Small>
        {[city, state].filter(Boolean).join(', ')}
        {city || state ? ' · ' : ''}
        {roundsPlayed} {roundsPlayed === 1 ? 'round' : 'rounds'} played
      </Small>

      {roundsPlayed === 0 ? (
        <EmptyState
          title="Nobody has played here yet"
          hint="Finish a round at this course and its records start filling in."
          actions={[{ label: 'Schedule a round', onPress: () => router.push('/round/new') }]}
        />
      ) : null}

      {lowRound ? (
        <Card>
          <Heading>Course record</Heading>
          <Small>Among the people you play with — this is your crews&apos; history, not the world&apos;s.</Small>
          <Row justify="space-between">
            <Body>{lowRound.name}</Body>
            <Body>{lowRound.strokes}</Body>
          </Row>
          <Button
            title="See that card"
            variant="secondary"
            onPress={() => router.push(`/round/${lowRound.roundId}/card`)}
          />
        </Card>
      ) : null}

      {regulars.length > 0 ? (
        <Card>
          <Heading>Regulars</Heading>
          {regulars.map((regular) => (
            <Row key={regular.key} justify="space-between">
              <Body>{regular.name}</Body>
              <Small>
                {regular.scoringAverage} avg · best {regular.bestGross} · {regular.roundsPlayed}
                {regular.roundsPlayed === 1 ? ' round' : ' rounds'}
              </Small>
            </Row>
          ))}
        </Card>
      ) : null}

      {hardestHole ? (
        <Card>
          <Heading>Hardest hole</Heading>
          <Row justify="space-between">
            <Body>
              Hole {hardestHole.number}
              {hardestHole.par !== null ? ` · par ${hardestHole.par}` : ''}
            </Body>
            <Small>
              {hardestHole.averageStrokes} avg
              {hardestHole.overPar !== null
                ? ` · ${hardestHole.overPar > 0 ? '+' : ''}${hardestHole.overPar}`
                : ''}
            </Small>
          </Row>
        </Card>
      ) : null}

      {owned.length > 0 ? (
        <Card>
          <Heading>Who owns which hole</Heading>
          <Small>Lowest average, minimum two goes at it.</Small>
          {owned.map((hole) => (
            <Row key={hole.number} justify="space-between">
              <Body>
                {hole.number}
                {hole.par !== null ? ` · par ${hole.par}` : ''}
              </Body>
              <Small>{hole.ownedBy}</Small>
            </Row>
          ))}
        </Card>
      ) : null}

      <Button
        title="Fix this card"
        variant="secondary"
        onPress={() => router.push(`/course/${id}/card`)}
      />
    </Screen>
  );
}
