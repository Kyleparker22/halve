import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { formatCents } from '@halve/ledger';
import { Body, Button, ErrorNote, Small } from './ui';
import { breadcrumb, captureError } from '../lib/analytics';
import { radius, spacing, useTheme } from '../theme';

export interface ShareLine {
  name: string;
  amountCents: number;
}

interface Props {
  courseName: string;
  dateLabel: string;
  /** Signed money per player, biggest winner first. */
  money: ShareLine[];
  /** The single line most worth bragging about, if there is one. */
  headline: string | null;
  /** Gross leaderboard, already ordered. */
  leaderboard: Array<{ name: string; gross: number }>;
}

/**
 * The artifact that leaves the app.
 *
 * A golf round's natural end is somebody posting the result to the group chat.
 * Until now the only way to do that was a screenshot of a UI that was not built
 * to be looked at out of context — so this renders a card meant to be seen by
 * people who do not have the app, with the one thing no other golf app can put
 * on it: the money.
 *
 * Rendered on-screen rather than off, because captureRef on an unmounted or
 * zero-opacity view returns blank images on iOS. It is small enough to live at
 * the bottom of the recap.
 */
export function ShareCard({ courseName, dateLabel, money, headline, leaderboard }: Props) {
  const theme = useTheme();
  const shotRef = useRef<React.ComponentRef<typeof ViewShot>>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const winner = money[0];
  const loser = money[money.length - 1];

  const share = async () => {
    setSharing(true);
    setError(null);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('Sharing is not available on this device.');
      }
      const uri = await captureRef(shotRef, { format: 'png', quality: 1, result: 'tmpfile' });
      breadcrumb('shared round recap', { course: courseName });
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: `${courseName} — the damage`,
        UTI: 'public.png',
      });
    } catch (caught) {
      const asError = caught instanceof Error ? caught : new Error(String(caught));
      // Not fatal — the recap is still readable. But a share that silently does
      // nothing is the kind of thing nobody reports and everybody stops trying.
      captureError(asError, { kind: 'share-card' });
      setError(asError);
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={{ gap: spacing.md }}>
      <ViewShot ref={shotRef} style={{ backgroundColor: theme.bg }}>
        <View
          style={{
            padding: spacing.lg,
            gap: spacing.md,
            backgroundColor: theme.card,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <View>
            <Body style={{ fontSize: 20, fontWeight: '700', color: theme.text }}>{courseName}</Body>
            <Small>{dateLabel}</Small>
          </View>

          {winner && winner.amountCents > 0 ? (
            <View>
              <Body style={{ fontSize: 28, fontWeight: '800', color: theme.accent }}>
                {winner.name} {formatCents(winner.amountCents)}
              </Body>
              {loser && loser !== winner && loser.amountCents < 0 ? (
                <Small>
                  {loser.name} {formatCents(loser.amountCents)}
                </Small>
              ) : null}
            </View>
          ) : (
            <Body style={{ fontSize: 20, fontWeight: '700', color: theme.text }}>
              All square. Nobody owes anybody.
            </Body>
          )}

          {headline ? <Small>{headline}</Small> : null}

          {leaderboard.length > 0 ? (
            <View style={{ gap: 2 }}>
              {leaderboard.slice(0, 6).map((entry, index) => (
                <Body key={`${entry.name}-${index}`} style={{ color: theme.text }}>
                  {index + 1}. {entry.name} — {entry.gross}
                </Body>
              ))}
            </View>
          ) : null}

          {/* The only marketing in the whole app, and it goes out on an image
              somebody chose to send to their friends. */}
          <Small>Bagdrop</Small>
        </View>
      </ViewShot>

      {error ? <ErrorNote error={error} /> : null}
      <Button
        title={sharing ? 'Preparing…' : 'Share the damage'}
        disabled={sharing}
        onPress={() => void share()}
      />
      {Platform.OS === 'android' ? (
        <Small>Sends as an image — drops straight into a group chat.</Small>
      ) : null}
    </View>
  );
}
