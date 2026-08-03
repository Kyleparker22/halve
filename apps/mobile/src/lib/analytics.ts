import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';
import PostHog from 'posthog-react-native';

let posthog: PostHog | null = null;

/**
 * Anything that looks like a credential or a payment handle, stripped before a
 * report leaves the phone. sendDefaultPii: false covers Sentry's own
 * collection; it does nothing about values we put in `extra` ourselves, and the
 * things this app handles — Supabase tokens, Venmo deep links — are exactly the
 * things you do not want in a third-party dashboard.
 */
const SENSITIVE = /(token|secret|key|password|authorization|venmo|cashapp|phone|email)/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, val]) => [
      key,
      SENSITIVE.test(key) ? '[redacted]' : scrub(val, depth + 1),
    ]),
  );
}

export function initTelemetry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (dsn) {
    Sentry.init({
      dsn,
      tracesSampleRate: 0.2,
      // Scores are user data; never ship them to an error tracker.
      sendDefaultPii: false,
      /**
       * Release and dist have to match what the build uploaded its source maps
       * under, or every stack trace arrives minified and a crash report becomes
       * a line number in a bundle nobody can read.
       */
      release: `${Constants.expoConfig?.slug ?? 'halve'}@${Constants.expoConfig?.version ?? '0.0.0'}`,
      dist: String(
        (Constants.expoConfig?.ios as { buildNumber?: string } | undefined)?.buildNumber ?? '0',
      ),
      beforeSend(event) {
        if (event.extra) event.extra = scrub(event.extra) as Record<string, unknown>;
        if (event.contexts) event.contexts = scrub(event.contexts) as typeof event.contexts;
        return event;
      },
    });
  }

  const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (key) {
    posthog = new PostHog(key, {
      host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    });
  }
}

export function identify(profileId: string): void {
  Sentry.setUser({ id: profileId });
  posthog?.identify(profileId);
}

export function track(event: string, properties?: Record<string, string | number | boolean>): void {
  posthog?.capture(event, properties);
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/**
 * A breadcrumb trail, so a crash report says what the golfer was doing rather
 * than only where it landed. "entered a score on 7, went offline, opened the
 * recap" is a bug report; a stack trace on its own usually is not.
 */
export function breadcrumb(message: string, data?: Record<string, unknown>): void {
  Sentry.addBreadcrumb({ message, data, level: 'info' });
}

/** Wraps the root component for render-error capture. */
export const withTelemetry = Sentry.wrap;
