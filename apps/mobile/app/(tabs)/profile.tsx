import { Alert } from 'react-native';
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
import {
  useDeleteAccount,
  useProfile,
  useSession,
  useSignOut,
} from '../../src/hooks/useSession';
import { useCrewBalancesForMe } from '../../src/hooks/useBalances';

export default function ProfileScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { data: profile, isLoading } = useProfile(session?.user.id);
  const balances = useCrewBalancesForMe(session?.user.id);
  const signOut = useSignOut();
  const deleteAccount = useDeleteAccount();

  if (isLoading || !profile) return <Loading />;

  const season = (balances.data ?? []).reduce((sum, row) => sum + row.net_cents, 0);

  return (
    <Screen>
      <Title>{profile.display_name}</Title>
      <Small>@{profile.handle}</Small>

      <Card>
        <Row justify="space-between">
          <Heading>Season</Heading>
          <Money cents={season} size={22} />
        </Row>
        <Small>Across every crew, open entries only.</Small>
      </Card>

      <Card>
        <Row justify="space-between">
          <Body>Handicap index</Body>
          <Body>{profile.handicap_index ?? '—'}</Body>
        </Row>
        <Small>Self-reported. Not a USGA or WHS number.</Small>
      </Card>

      <Button
        title="Edit profile"
        variant="secondary"
        onPress={() => router.push('/(auth)/onboarding')}
      />
      <Button title="Notification settings" variant="secondary" onPress={() => router.push('/settings/notifications')} />
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

      <Small>
        Halve is a scorekeeping and expense-splitting tool for friends. It never holds or transfers
        money.
      </Small>
    </Screen>
  );
}
