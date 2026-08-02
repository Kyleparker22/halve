import { useLocalSearchParams, useRouter } from 'expo-router';
import { Body, Button, Card, Loading, Screen, Small, Title } from '../../src/components/ui';
import { useCrewPreview, useJoinCrew } from '../../src/hooks/useCrews';
import { useJoinTrip } from '../../src/hooks/useTrips';

/**
 * Invite-link target. The preview is a security-definer function returning the
 * crew's name and size only — never the roster, and never before you join.
 */
export default function JoinScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const preview = useCrewPreview(code);
  const joinCrew = useJoinCrew();
  const joinTrip = useJoinTrip();

  if (preview.isLoading) return <Loading label="Looking up that invite…" />;

  const crew = preview.data;

  return (
    <Screen>
      <Title>{crew ? crew.name : 'Invite'}</Title>

      {crew ? (
        <Card>
          <Body>
            {crew.member_count} {crew.member_count === 1 ? 'golfer' : 'golfers'} already in.
          </Body>
          <Button
            title="Join this crew"
            loading={joinCrew.isPending}
            onPress={() =>
              joinCrew.mutate(code, { onSuccess: (crewId) => router.replace(`/crew/${crewId}`) })
            }
          />
        </Card>
      ) : (
        <Card>
          <Body>This might be a trip invite.</Body>
          <Button
            title="Join the trip"
            loading={joinTrip.isPending}
            onPress={() =>
              joinTrip.mutate(code, { onSuccess: (tripId) => router.replace(`/trip/${tripId}`) })
            }
          />
          {joinTrip.error ? <Small>{(joinTrip.error as Error).message}</Small> : null}
        </Card>
      )}

      {joinCrew.error ? <Small>{(joinCrew.error as Error).message}</Small> : null}
    </Screen>
  );
}
