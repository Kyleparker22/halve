import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button, Card, Heading, Row, Small } from './ui';
import {
  useAddComment,
  useComments,
  useDeleteComment,
  useReact,
  type FeedEntry,
} from '../hooks/useSocial';
import { radius, spacing, useTheme } from '../theme';

/** Enough to react with, few enough to fit one row on a phone. */
const EMOJI = ['👏', '😂', '🔥', '💸', '🫡'];

/** Plain English for a feed row. The type alone is not a sentence. */
export function describeFeedItem(type: string, payload: unknown, actorName: string | null): string {
  const data = (payload ?? {}) as Record<string, unknown>;
  const who = actorName ?? 'Someone';
  switch (type) {
    case 'round_completed':
      return `Round at ${String(data.course ?? 'the course')} is in the books`;
    case 'round_scheduled': {
      const when = data.scheduled_at ? new Date(String(data.scheduled_at)) : null;
      const date = when ? when.toLocaleDateString(undefined, { weekday: 'long' }) : 'soon';
      return `${who} put a round at ${String(data.course ?? 'a course')} on the books for ${date}`;
    }
    case 'member_joined':
      return `${who} joined the crew`;
    case 'trip_created':
      return `${who} started a trip: ${String(data.name ?? 'somewhere good')}`;
    case 'settled_up': {
      const cents = Number(data.total_cents ?? 0);
      return cents > 0 ? `Everyone settled up — $${(cents / 100).toFixed(0)} moved` : 'Everyone settled up';
    }
    case 'settlement_confirmed':
      return 'Settled up';
    case 'club_added':
      // The club, never the distance — bags stay private on the numbers.
      return `${who} put a new ${String(data.club ?? 'club')} in the bag`;
    default:
      return type.replace(/_/g, ' ');
  }
}

interface Props {
  crewId: string;
  item: FeedEntry;
  meId: string | undefined;
  /** Collapsed rows are for the crew screen; the feed screen expands them. */
  expanded?: boolean;
}

export function FeedItem({ crewId, item, meId, expanded = false }: Props) {
  const theme = useTheme();
  const router = useRouter();
  const react = useReact(crewId);
  const [open, setOpen] = useState(expanded);
  const [draft, setDraft] = useState('');
  const comments = useComments(open ? item.id : undefined);
  const addComment = useAddComment(crewId, item.id);
  const removeComment = useDeleteComment(item.id);

  const text = describeFeedItem(item.type, item.payload, item.actor?.display_name ?? null);

  // Feed rows are about something; tapping should go to it.
  const target =
    item.subject_type === 'round' && item.subject_id
      ? `/round/${item.subject_id}`
      : item.subject_type === 'trip' && item.subject_id
        ? `/trip/${item.subject_id}`
        : null;

  return (
    <Card>
      <Pressable onPress={() => target && router.push(target as never)}>
        <Body>{text}</Body>
        <Small>{item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}</Small>
      </Pressable>

      <Row wrap gap={spacing.sm}>
        {EMOJI.map((emoji) => {
          const who = item.reactions[emoji] ?? [];
          const mine = meId ? who.includes(meId) : false;
          return (
            <Pressable
              key={emoji}
              disabled={!meId}
              onPress={() =>
                meId && react.mutate({ feedItemId: item.id, profileId: meId, emoji, on: !mine })
              }
            >
              <Body style={{ color: mine ? theme.accent : theme.muted }}>
                {emoji}
                {who.length > 0 ? ` ${who.length}` : ''}
              </Body>
            </Pressable>
          );
        })}
        <Pressable onPress={() => setOpen((v) => !v)}>
          <Small>
            {item.commentCount > 0
              ? `${item.commentCount} ${item.commentCount === 1 ? 'comment' : 'comments'}`
              : 'Comment'}
          </Small>
        </Pressable>
      </Row>

      {open ? (
        <View style={{ gap: spacing.sm }}>
          {(comments.data ?? []).map((comment) => (
            <Row key={comment.id} justify="space-between">
              <Body>
                <Body style={{ color: theme.muted }}>{comment.authorName}: </Body>
                {comment.body}
              </Body>
              {comment.authorId === meId ? (
                <Pressable onPress={() => removeComment.mutate(comment.id)}>
                  <Small>delete</Small>
                </Pressable>
              ) : null}
            </Row>
          ))}
          {meId ? (
            <Row gap={spacing.sm}>
              <TextInput
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: radius.md,
                  color: theme.text,
                  padding: spacing.sm,
                  minHeight: 40,
                }}
                value={draft}
                onChangeText={setDraft}
                placeholder="Say something"
                placeholderTextColor={theme.muted}
              />
              <Button
                title="Send"
                variant="secondary"
                disabled={draft.trim().length === 0 || addComment.isPending}
                onPress={() =>
                  addComment.mutate(
                    { profileId: meId, body: draft },
                    { onSuccess: () => setDraft('') },
                  )
                }
              />
            </Row>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

export function FeedHeading() {
  return <Heading>What the crew has been up to</Heading>;
}
