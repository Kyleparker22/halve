import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  EmptyState,
  ErrorNote,
  Loading,
  Pill,
  Row,
  Screen,
  Title,
} from '../../src/components/ui';
import { FeedItem } from '../../src/components/FeedItem';
import { useSocialFeed } from '../../src/hooks/useSocial';
import { useSession } from '../../src/hooks/useSession';
import { spacing } from '../../src/theme';

/**
 * Everything your people are up to, across every crew: rounds going on the
 * books and finishing, trips forming, money settling, new clubs in bags.
 *
 * This is the crew feeds merged, not a separate social graph — feed_items is
 * already RLS-scoped to your crews, so the query without a crew filter *is*
 * "my friends' activity", and nothing here can ever show a stranger.
 */
export default function SocialScreen() {
  const router = useRouter();
  const { session } = useSession();
  const feed = useSocialFeed(Boolean(session?.user.id));

  if (feed.isLoading) return <Loading />;
  if (feed.error) return <ErrorNote error={feed.error} onRetry={() => void feed.refetch()} />;

  const items = feed.data ?? [];
  // Only label rows with the crew when there is more than one to tell apart.
  const crews = new Set(items.map((i) => i.crewName));

  return (
    <Screen>
      <Title>Social</Title>

      {items.length === 0 ? (
        <EmptyState
          title="Quiet out there"
          hint="When your friends schedule rounds, finish trips, settle up or put a new club in the bag, it shows up here."
          actions={[{ label: 'Schedule a round', onPress: () => router.push('/round/new') }]}
        />
      ) : null}

      {items.map((item) => (
        <View key={item.id} style={{ gap: spacing.xs }}>
          {crews.size > 1 ? (
            <Row justify="flex-start">
              <Pill label={item.crewName} />
            </Row>
          ) : null}
          <FeedItem crewId={item.crew_id} item={item} meId={session?.user.id} />
        </View>
      ))}
    </Screen>
  );
}
