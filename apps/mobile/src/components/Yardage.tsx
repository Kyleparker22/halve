import { useState } from 'react';
import { View } from 'react-native';
import { Body, Button, Card, ErrorNote, Row, Small } from './ui';
import {
  useHolePoints,
  useImportCourseGps,
  usePosition,
  useSetGreenPoint,
} from '../hooks/useGps';
import { yardagesTo } from '../lib/geo';
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
            : 'This course has no green locations yet. Turn on GPS and Bagdrop will look them up.'}
        </Small>
      </Card>
    );
  }

  if (fix.state === 'denied') {
    return (
      <Card>
        <Body>Yardages need location</Body>
        <Small>
          Location permission was declined. Turn it on for Bagdrop in Settings and reopen the card.
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
          <Small>Bagdrop can look this course up in OpenStreetMap. It takes a few seconds.</Small>
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
