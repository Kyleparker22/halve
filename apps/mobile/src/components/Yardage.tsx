import { useState } from 'react';
import { View } from 'react-native';
import { Body, Button, Card, ErrorNote, Row, Small } from './ui';
import {
  useHolePoints,
  useImportCourseGps,
  usePosition,
  useSetGreenPoint,
} from '../hooks/useGps';
import { bearingBetween, yardagesTo } from '../lib/geo';
import { playsLike, recommendClub } from '../lib/clubs';
import { useClubs, useWeather } from '../hooks/useClubs';
import { useSession } from '../hooks/useSession';
import { spacing, useTheme } from '../theme';

interface Props {
  courseId: string | null;
  holeNumber: number;
}

/**
 * Front / centre / back from where the golfer is standing.
 *
 * Off by default. Four hours of continuous GPS is the fastest way to flatten a
 * phone, and a scoring app that dies on the twelfth gets deleted — so the
 * golfer turns it on for the round rather than the app deciding for them.
 */
export function Yardage({ courseId, holeNumber }: Props) {
  const theme = useTheme();
  const [on, setOn] = useState(false);
  const points = useHolePoints(courseId ?? undefined);
  const importGps = useImportCourseGps(courseId ?? undefined);
  const setGreen = useSetGreenPoint(courseId ?? '');
  const fix = usePosition(on);
  const { session } = useSession();
  const clubs = useClubs(session?.user.id);
  // Weather is a refinement, not a dependency — a null here degrades the
  // recommendation to raw distance rather than blocking it.
  const weather = useWeather(on ? fix.point : null);

  if (!courseId) return null;

  const hole = (points.data ?? []).find((p) => p.holeNumber === holeNumber);
  const mapped = (points.data ?? []).length > 0;

  if (!on) {
    return (
      <Card>
        <Row justify="space-between">
          <Body>Yardages</Body>
          <Button title="Turn on GPS" variant="secondary" onPress={() => setOn(true)} />
        </Row>
        <Small>
          {mapped
            ? 'Uses your location while the card is open. Off by default so it does not drain your battery for four hours.'
            : 'This course has no green locations yet. Turn on GPS and Kaddee will look them up.'}
        </Small>
      </Card>
    );
  }

  if (fix.state === 'denied') {
    return (
      <Card>
        <Body>Yardages need location</Body>
        <Small>
          Location permission was declined. Turn it on for Kaddee in Settings and reopen the card.
        </Small>
        <Button title="Hide" variant="secondary" onPress={() => setOn(false)} />
      </Card>
    );
  }

  // Nothing mapped for this course yet — offer the import, then the fallback.
  if (!mapped) {
    return (
      <Card>
        <Body>No green locations for this course</Body>
        {importGps.error ? <ErrorNote error={importGps.error} /> : null}
        {importGps.data && importGps.data.imported === 0 ? (
          <Small>
            OpenStreetMap does not have this course mapped. You can set the greens yourself — walk
            onto each one and tap the button below.
          </Small>
        ) : (
          <Small>Kaddee can look this course up in OpenStreetMap. It takes a few seconds.</Small>
        )}
        <Row gap={spacing.sm}>
          <Button
            title={importGps.isPending ? 'Looking…' : 'Look it up'}
            disabled={importGps.isPending}
            onPress={() => importGps.mutate()}
          />
          <Button
            title="Hide"
            variant="secondary"
            onPress={() => setOn(false)}
          />
        </Row>
        {fix.state === 'ready' && fix.point ? (
          <Button
            title={`I am on the green at ${holeNumber}`}
            variant="secondary"
            disabled={setGreen.isPending}
            onPress={() => setGreen.mutate({ hole: holeNumber, point: fix.point! })}
          />
        ) : null}
      </Card>
    );
  }

  if (fix.state !== 'ready' || !fix.point) {
    return (
      <Card>
        <Body>Finding you…</Body>
        <Small>
          {fix.accuracy
            ? `Accurate to about ${Math.round(fix.accuracy)}m — waiting for better than 25m before showing a number.`
            : 'Waiting for a GPS fix.'}
        </Small>
        <Button title="Hide" variant="secondary" onPress={() => setOn(false)} />
      </Card>
    );
  }

  if (!hole) {
    return (
      <Card>
        <Body>Hole {holeNumber} is not mapped</Body>
        <Small>The rest of this course is. Walk onto the green and set it.</Small>
        {setGreen.error ? <ErrorNote error={setGreen.error} /> : null}
        <Button
          title={`I am on the green at ${holeNumber}`}
          disabled={setGreen.isPending}
          onPress={() => setGreen.mutate({ hole: holeNumber, point: fix.point! })}
        />
      </Card>
    );
  }

  const y = yardagesTo(fix.point, { front: hole.front, centre: hole.green, back: hole.back });

  /**
   * Club selection is about the centre, and about what the shot *plays* rather
   * than what the GPS measures. Wind needs the shot's bearing to be usable at
   * all — a speed with no direction relative to the target is not information.
   */
  const bearing = bearingBetween(fix.point, hole.green);
  const adjusted = playsLike(y.centre, {
    windMph: weather.data?.windMph,
    windFromDeg: weather.data?.windFromDeg,
    shotBearingDeg: bearing,
    tempC: weather.data?.tempC,
    altitudeM: weather.data?.altitudeM,
  });
  const suggestion = recommendClub(clubs.data ?? [], adjusted.playsLike);

  return (
    <Card>
      <Row justify="space-between" align="flex-end">
        <View>
          <Small>Front</Small>
          <Body style={{ fontSize: 22, fontWeight: '700', color: theme.text }}>
            {y.front ?? '—'}
          </Body>
        </View>
        <View>
          {/* Centre is the number people actually use, so it is the big one. */}
          <Small>Centre</Small>
          <Body style={{ fontSize: 40, fontWeight: '800', color: theme.accent }}>{y.centre}</Body>
        </View>
        <View>
          <Small>Back</Small>
          <Body style={{ fontSize: 22, fontWeight: '700', color: theme.text }}>
            {y.back ?? '—'}
          </Body>
        </View>
      </Row>

      {suggestion ? (
        <>
          <Row justify="space-between" align="flex-end">
            <View>
              <Small>Plays like</Small>
              <Body style={{ fontSize: 22, fontWeight: '700', color: theme.text }}>
                {adjusted.playsLike}
              </Body>
            </View>
            <View>
              <Small>
                Club{suggestion.slackYards !== 0
                  ? ` · ${Math.abs(suggestion.slackYards)} ${suggestion.slackYards > 0 ? 'to spare' : 'short'}`
                  : ''}
              </Small>
              <Body style={{ fontSize: 28, fontWeight: '800', color: theme.win }}>
                {suggestion.club.name}
              </Body>
            </View>
          </Row>
          {/* The reasoning, always. "7 iron" on its own is a number to distrust;
              "152 plays 158 — 6 into the wind, 12 ft uphill" is one a golfer can
              disagree with, which is the point. */}
          {adjusted.adjustments.length > 0 ? (
            <Small>
              {adjusted.adjustments
                .map((a) => `${a.label} ${a.yards > 0 ? '+' : ''}${a.yards}`)
                .join(' · ')}
            </Small>
          ) : (
            <Small>No conditions data — off the raw number.</Small>
          )}
          {suggestion.alternatives.length > 0 ? (
            <Small>
              Either side: {suggestion.alternatives.map((c) => `${c.name} ${c.carryYards}`).join(' · ')}
            </Small>
          ) : null}
        </>
      ) : (
        <Small>
          Add your club distances in Profile and Kaddee will suggest one from here.
        </Small>
      )}

      <Row justify="space-between">
        <Small>
          {y.front === null
            ? 'Centre only — this green was set by hand.'
            : `±${Math.round(fix.accuracy ?? 0)}m`}
        </Small>
        <Small onPress={() => setOn(false)}>hide</Small>
      </Row>

      {/* ODbL requires attribution wherever the data is shown. Not optional. */}
      {hole.source === 'osm' ? <Small>Green data © OpenStreetMap contributors</Small> : null}
    </Card>
  );
}
