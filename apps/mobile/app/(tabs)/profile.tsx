import { Alert, Linking } from 'react-native';
import * as Application from 'expo-application';
import { useRouter } from 'expo-router';
import {
  Body,
  Button,
  Card,
  Heading,
  Loading,
  Money,
  Row,
  Screen,
  Small,
  Title,
} from '../../src/components/ui';
import { useDeleteAccount, useProfile, useSession, useSignOut } from '../../src/hooks/useSession';
import { useCrewBalancesForMe } from '../../src/hooks/useBalances';
import { useRounds } from '../../src/hooks/useRounds';
import { useTrips } from '../../src/hooks/useTrips';
import { useClubs } from '../../src/hooks/useClubs';
import { spacing } from '../../src/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { data: profile, isLoading } = useProfile(session?.user.id);
  const balances = useCrewBalancesForMe(session?.user.id);
  const rounds = useRounds(session?.user.id);
  const trips = useTrips();
  const clubs = useClubs(session?.user.id);
  const signOut = useSignOut();
  const deleteAccount = useDeleteAccount();

  if (isLoading || !profile) return <Loading />;

  const season = (balances.data ?? []).reduce((sum, row) => sum + row.net_cents, 0);
  const all = rounds.data ?? [];

  // ---- The record. Played rounds with a card; money days won and lost. ----
  const played = all.filter((r) => r.status === 'completed' && r.myGross !== null);
  const moneyDays = all.filter((r) => r.status === 'completed' && r.myMoneyCents !== null);
  const wins = moneyDays.filter((r) => (r.myMoneyCents ?? 0) > 0).length;
  const losses = moneyDays.filter((r) => (r.myMoneyCents ?? 0) < 0).length;
  const pushes = moneyDays.length - wins - losses;
  const bestGross = played.length > 0 ? Math.min(...played.map((r) => r.myGross!)) : null;
  const lifetime = moneyDays.reduce((sum, r) => sum + (r.myMoneyCents ?? 0), 0);
  const biggestDay =
    moneyDays.length > 0 ? Math.max(...moneyDays.map((r) => r.myMoneyCents ?? 0)) : null;

  // Home turf: wherever you have actually played the most.
  const courseCounts = new Map<string, number>();
  for (const r of played) courseCounts.set(r.courseName, (courseCounts.get(r.courseName) ?? 0) + 1);
  const homeTurf = [...courseCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  // ---- Next up: the sooner of your next round and next trip. ----
  const nextRound = all.find((r) => r.status === 'scheduled' || r.status === 'in_progress') ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const nextTrip =
    (trips.data ?? [])
      .filter((t) => t.status !== 'completed' && t.status !== 'cancelled' && t.end_date >= today)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null;

  const bag = clubs.data ?? [];
  const longest = bag[0] ?? null; // already ordered longest first

  return (
    <Screen>
      <Title>{profile.display_name}</Title>
      <Small>
        @{profile.handle}
        {profile.handicap_index !== null ? ` · ${profile.handicap_index} hcp` : ''}
      </Small>

      {/* What's next comes first — the profile is where you check your own
          Saturday, not an archive. */}
      {nextRound || nextTrip ? (
        <Card>
          <Heading>Next up</Heading>
          {nextRound ? (
            <Row justify="space-between">
              <Body onPress={() => router.push(`/round/${nextRound.id}`)}>
                {nextRound.status === 'in_progress' ? '⛳ Live now — ' : ''}
                {nextRound.courseName}
              </Body>
              <Small>
                {new Date(nextRound.scheduled_at).toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </Small>
            </Row>
          ) : null}
          {nextTrip ? (
            <Row justify="space-between">
              <Body onPress={() => router.push(`/trip/${nextTrip.id}`)}>
                ✈ {nextTrip.name}
              </Body>
              <Small>{nextTrip.start_date}</Small>
            </Row>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Row justify="space-between">
          <Heading>Season</Heading>
          <Money cents={season} size={22} />
        </Row>
        <Small>Across every crew, open entries only.</Small>
      </Card>

      <Card>
        <Heading>The record</Heading>
        {played.length === 0 && moneyDays.length === 0 ? (
          <Small>Play a round and this fills in — rounds, best score, money days won.</Small>
        ) : (
          <>
            <Row justify="space-between">
              <Body>Rounds played</Body>
              <Body>{played.length}</Body>
            </Row>
            {bestGross !== null ? (
              <Row justify="space-between">
                <Body>Best round</Body>
                <Body>{bestGross}</Body>
              </Row>
            ) : null}
            {moneyDays.length > 0 ? (
              <Row justify="space-between">
                <Body>Money days</Body>
                <Body>
                  {wins}–{losses}
                  {pushes > 0 ? `–${pushes}` : ''}
                </Body>
              </Row>
            ) : null}
            {moneyDays.length > 0 ? (
              <Row justify="space-between">
                <Body>Lifetime</Body>
                <Money cents={lifetime} />
              </Row>
            ) : null}
            {biggestDay !== null && biggestDay > 0 ? (
              <Row justify="space-between">
                <Body>Biggest day</Body>
                <Money cents={biggestDay} />
              </Row>
            ) : null}
            {homeTurf ? (
              <Row justify="space-between">
                <Body>Home turf</Body>
                <Small>
                  {homeTurf[0]} · {homeTurf[1]}×
                </Small>
              </Row>
            ) : null}
          </>
        )}
      </Card>

      <Card>
        <Row justify="space-between">
          <Heading>The bag</Heading>
          <Button title="Edit" variant="secondary" onPress={() => router.push('/settings/bag')} />
        </Row>
        {bag.length === 0 ? (
          <Small>
            Add your club distances and the scorecard suggests a club from the fairway — wind,
            elevation and temperature included.
          </Small>
        ) : (
          <>
            <Row wrap gap={spacing.sm}>
              {bag.map((club) => (
                <Small key={club.id}>
                  {club.name} {club.carryYards}
                </Small>
              ))}
            </Row>
            {longest ? (
              <Small>
                {bag.length} clubs · big stick: {longest.name} at {longest.carryYards}
              </Small>
            ) : null}
          </>
        )}
      </Card>

      <Button
        title="Edit profile"
        variant="secondary"
        onPress={() => router.push('/(auth)/onboarding')}
      />
      <Button
        title="Notification settings"
        variant="secondary"
        onPress={() => router.push('/settings/notifications')}
      />
      <Button title="Sign out" variant="secondary" onPress={() => signOut.mutate()} />

      <Card>
        <Heading>Delete account</Heading>
        <Body muted>
          Your profile is anonymised and your handle released. Money history stays, because it has
          to balance for everyone else in the crew.
        </Body>
        <Button
          title="Delete my account"
          variant="danger"
          onPress={() =>
            Alert.alert('Delete account?', 'This cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => deleteAccount.mutate(),
              },
            ])
          }
        />
      </Card>

      {/* Apple requires a reachable privacy policy for any app with an account,
          and both of these must be live before a public listing. They are links
          rather than bundled text so they can be corrected without a build. */}
      <Row gap={spacing.md}>
        <Button
          title="Privacy"
          variant="secondary"
          onPress={() => void Linking.openURL('https://halve.golf/privacy')}
        />
        <Button
          title="Terms"
          variant="secondary"
          onPress={() => void Linking.openURL('https://halve.golf/terms')}
        />
      </Row>

      <Small>
        Bagdrop is a scorekeeping and expense-splitting tool for friends. It never holds or transfers
        money.
      </Small>
      {/*
        Support asks "what build are you on?" before anything else — so this has
        to read the *installed binary*, not the app config. With
        appVersionSource: "remote" the build number is assigned by EAS at build
        time and never appears in expoConfig, so reading it from there showed a
        dash on every real build. Application reads Info.plist at runtime, which
        is the only place the shipped number actually exists.
      */}
      <Small>
        Version {Application.nativeApplicationVersion ?? '—'} (
        {Application.nativeBuildVersion ?? '—'})
      </Small>
    </Screen>
  );
}
