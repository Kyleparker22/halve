import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button, Card, Screen, Small, Title } from '../../src/components/ui';
import { useSignInWithOtp, useSignInWithProvider, useVerifyOtp } from '../../src/hooks/useSession';
import { radius, spacing, useTheme } from '../../src/theme';

export default function SignIn() {
  const theme = useTheme();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);

  const provider = useSignInWithProvider();
  const otp = useSignInWithOtp();
  const verify = useVerifyOtp();

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
        <Title>Halve</Title>
        <Body muted>Your crew&apos;s round, card, bets and trip — in one place.</Body>
      </View>

      <Card>
        {/* Apple first: required by the App Store once another provider exists. */}
        <Button title="Continue with Apple" onPress={() => provider.mutate('apple')} />
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

      <Small>
        Halve records friendly wagers between people who know each other. It never holds or moves
        money.
      </Small>
    </Screen>
  );
}
