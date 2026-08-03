import { useLocalSearchParams } from 'expo-router';
import { EmptyState, ErrorNote, Loading, Screen, Small, Title } from '../../../src/components/ui';
import { FeedItem } from '../../../src/components/FeedItem';
import { useFeed } from '../../../src/hooks/useSocial';
import { useSession } from '../../../src/hooks/useSession';

export default function FeedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const feed = useFeed(id);

  if (feed.isLoading) return <Loading />;
  if (feed.error) return <ErrorNote error={feed.error} />;

  const items = feed.data ?? [];

  return (
    <Screen>
      <Title>Activity</Title>
      {items.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          hint="Rounds, trips, people joining and money settling all show up here."
        />
      ) : (
        <Small>Tap a row to open what it is about.</Small>
      )}
      {items.map((item) => (
        <FeedItem key={item.id} crewId={id} item={item} meId={session?.user.id} expanded />
      ))}
    </Screen>
  );
}
