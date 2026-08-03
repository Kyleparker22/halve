import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button, Card, Screen, Small, Title } from '../../src/components/ui';
import {
  useDevEmailSignIn,
  useSignInWithApple,
  useSignInWithOtp,
  useSignInWithProvider,
  useVerifyOtp,
} from '../../src/hooks/useSession';
import { radius, spacing, useTheme } from '../../src/theme';

/**
 * Email sign-in is a development affordance: Apple needs a paid account, Google
 * needs OAuth credentials and phone OTP needs Twilio.
 *
 * It is also the only way an automated test can authenticate. A dev build shows
 * the Expo launcher, which blocks Maestro; a release build has no test sign-in
 * at all. So the E2E build is a release build with this one flag set, which
 * keeps the tested binary as close to the shipped one as it can be while still
 * being drivable. Unset in every real build, so it cannot ship on.
 */
const DEV_SIGN_IN = __DEV__ || process.env.EXPO_PUBLIC_E2E === '1';

export default function SignIn() {
  const theme = useTheme();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [devEmail, setDevEmail] = useState('');
  const [devPassword, setDevPassword] = useState('');

  const provider = useSignInWithProvider();
  const otp = useSignInWithOtp();
  const verify = useVerifyOtp();
  const devSignIn = useDevEmailSignIn();
  const apple = useSignInWithApple();

  const input = {
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
    color: theme.text,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 48,
    fontSize: 17,
  };

  return (
    <Screen>
      <View style={{ gap: spacing.xs, marginTop: spacing.xxl }}>
        <Title>Bagdrop</Title>
        <Body muted>Your crew&apos;s round, card, bets and trip — in one place.</Body>
      </View>

      <Card>
        {/* Apple first: required by the App Store once another provider exists. */}
        <Button
          title="Continue with Apple"
          loading={apple.isPending}
          onPress={() => apple.mutate()}
        />
        {apple.error ? <Small>{(apple.error as Error).message}</Small> : null}
        <Button
          title="Continue with Google"
          variant="secondary"
          onPress={() => provider.mutate('google')}
        />
      </Card>

      <Card>
        <Body>Or use your phone</Body>
        <TextInput
          style={input}
          value={phone}
          onChangeText={setPhone}
          placeholder="+1 555 123 4567"
          placeholderTextColor={theme.muted}
          keyboardType="phone-pad"
          autoComplete="tel"
        />
        {sent ? (
          <>
            <TextInput
              style={input}
              value={code}
              onChangeText={setCode}
              placeholder="6-digit code"
              placeholderTextColor={theme.muted}
              keyboardType="number-pad"
              autoComplete="sms-otp"
            />
            <Button
              title="Verify"
              loading={verify.isPending}
              onPress={() =>
                verify.mutate(
                  { phone, token: code },
                  { onSuccess: () => router.replace('/(auth)/onboarding') },
                )
              }
            />
          </>
        ) : (
          <Button
            title="Send code"
            variant="secondary"
            loading={otp.isPending}
            onPress={() => otp.mutate(phone, { onSuccess: () => setSent(true) })}
          />
        )}
        {otp.error ? <Small>{(otp.error as Error).message}</Small> : null}
        {verify.error ? <Small>{(verify.error as Error).message}</Small> : null}
      </Card>

      {DEV_SIGN_IN ? (
        <Card>
          <Body>Development sign-in</Body>
          <Small>
            Never shipped — this block is compiled out of a release build. Signs you in, or creates
            the account if it does not exist yet.
          </Small>
          <TextInput
            style={input}
            testID="dev-email"
            value={devEmail}
            onChangeText={setDevEmail}
            placeholder="you@example.com"
            placeholderTextColor={theme.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <TextInput
            style={input}
            testID="dev-password"
            value={devPassword}
            onChangeText={setDevPassword}
            placeholder="password"
            placeholderTextColor={theme.muted}
            autoCapitalize="none"
            secureTextEntry
          />
          <Button
            title="Sign in (dev)"
            variant="secondary"
            loading={devSignIn.isPending}
            disabled={devEmail.trim().length === 0 || devPassword.length < 6}
            onPress={() =>
              devSignIn.mutate(
                { email: devEmail.trim(), password: devPassword },
                { onSuccess: () => router.replace('/(auth)/onboarding') },
              )
            }
          />
          {devSignIn.error ? <Small>{(devSignIn.error as Error).message}</Small> : null}
        </Card>
      ) : null}

      <Small>
        Bagdrop records friendly wagers between people who know each other. It never holds or moves
        money.
      </Small>
    </Screen>
  );
}
