import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HIT_SIZE, radius, spacing, type as typeScale, useTheme } from '../theme';

export function Screen({
  children,
  scroll = true,
  padded = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
}) {
  const theme = useTheme();
  const inner = (
    <View style={{ padding: padded ? spacing.lg : 0, gap: spacing.md, flexGrow: 1 }}>
      {children}
    </View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

export function Title({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Text
      style={[typeScale.title, { color: theme.text }, style]}
      onPress={onPress}
      // A tappable title is not obviously tappable, so tell the screen reader.
      accessibilityRole={onPress ? 'link' : undefined}
    >
      {children}
    </Text>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[typeScale.heading, { color: theme.text }]}>{children}</Text>;
}

export function Body({
  children,
  muted,
  style,
  numberOfLines,
  onPress,
}: {
  children: ReactNode;
  muted?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      onPress={onPress}
      style={[typeScale.body, { color: muted ? theme.muted : theme.text }, style]}
    >
      {children}
    </Text>
  );
}

export function Small({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Text onPress={onPress} style={[typeScale.small, { color: theme.muted }, style]}>
      {children}
    </Text>
  );
}

export function Card({
  children,
  onPress,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const body = (
    <View
      style={[
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.md,
          padding: spacing.lg,
          gap: spacing.sm,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {body}
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
}) {
  const theme = useTheme();
  const background =
    variant === 'primary' ? theme.accent : variant === 'danger' ? theme.loss : 'transparent';
  const color = variant === 'secondary' ? theme.text : theme.accentText;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading) }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: HIT_SIZE,
        borderRadius: radius.md,
        paddingHorizontal: spacing.lg,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: background,
        borderWidth: variant === 'secondary' ? StyleSheet.hairlineWidth : 0,
        borderColor: theme.border,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <Text style={[typeScale.heading, { color }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Row({
  children,
  gap = spacing.sm,
  align = 'center',
  justify = 'flex-start',
  wrap,
}: {
  children: ReactNode;
  gap?: number;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  wrap?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: align,
        justifyContent: justify,
        gap,
        flexWrap: wrap ? 'wrap' : 'nowrap',
      }}
    >
      {children}
    </View>
  );
}

export function Money({ cents, size = 17 }: { cents: number; size?: number }) {
  const theme = useTheme();
  const color = cents > 0 ? theme.win : cents < 0 ? theme.loss : theme.muted;
  const abs = Math.abs(cents);
  const text = `${cents > 0 ? '+' : cents < 0 ? '−' : ''}${
    abs % 100 === 0 ? `$${abs / 100}` : `$${(abs / 100).toFixed(2)}`
  }`;
  return <Text style={{ color, fontSize: size, fontWeight: '700' }}>{text}</Text>;
}

export function Pill({ label, tone = 'muted' }: { label: string; tone?: 'muted' | 'accent' | 'flag' }) {
  const theme = useTheme();
  const bg = tone === 'accent' ? theme.accent : tone === 'flag' ? theme.flag : theme.border;
  const fg = tone === 'muted' ? theme.text : theme.accentText;
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
      }}
    >
      <Text style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export interface EmptyAction {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}

/**
 * An empty state with nothing to tap is a dead end, and a dead end on the first
 * screen after sign-up is where new users leave. Every empty state should say
 * what to do and give the user the button to do it.
 */
export function EmptyState({
  title,
  hint,
  actions,
}: {
  title: string;
  hint?: string;
  actions?: EmptyAction[];
}) {
  return (
    <Card>
      <Heading>{title}</Heading>
      {hint ? <Body muted>{hint}</Body> : null}
      {(actions ?? []).map((action) => (
        <Button
          key={action.label}
          title={action.label}
          variant={action.variant ?? 'primary'}
          onPress={action.onPress}
        />
      ))}
    </Card>
  );
}

export function Loading({ label }: { label?: string }) {
  const theme = useTheme();
  return (
    <View style={{ padding: spacing.xl, alignItems: 'center', gap: spacing.sm }}>
      <ActivityIndicator color={theme.accent} />
      {label ? <Small>{label}</Small> : null}
    </View>
  );
}

/**
 * Offline is not "something went wrong" — it is the expected state of a phone
 * on a course, and telling someone their round broke when they are simply in a
 * dead spot is how you get a deleted app. Retry is offered when the caller can
 * actually retry.
 */
export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const theme = useTheme();
  const message = error instanceof Error ? error.message : String(error);
  const offline = /network request failed|fetch failed|offline|timeout/i.test(message);

  return (
    <Card style={{ borderColor: offline ? theme.border : theme.loss }}>
      <Heading>{offline ? 'No signal' : 'Something went wrong'}</Heading>
      <Body muted>
        {offline
          ? 'This will load when you are back on. Anything you have scored is saved on this phone and will sync.'
          : message}
      </Body>
      {onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} /> : null}
    </Card>
  );
}

/**
 * A shimmer block. Shown instead of a spinner on list screens, because a
 * spinner says "wait" and a skeleton says "here is the shape of what is
 * coming" — which on a cached-first app is usually true within a frame.
 */
export function Skeleton({ height = 16, width }: { height?: number; width?: number | string }) {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        height,
        width: (width ?? '100%') as never,
        borderRadius: radius.sm,
        backgroundColor: theme.border,
        opacity: pulse,
      }}
    />
  );
}

/** The shape of a list of cards, for the screens that are lists of cards. */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <Card key={i}>
          <Skeleton height={18} width="55%" />
          <Skeleton height={12} width="35%" />
        </Card>
      ))}
    </>
  );
}

export function Divider() {
  const theme = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border }} />;
}
