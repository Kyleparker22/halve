import * as Sentry from '@sentry/react-native';
import PostHog from 'posthog-react-native';

let posthog: PostHog | null = null;

export function initTelemetry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (dsn) {
    Sentry.init({
      dsn,
      tracesSampleRate: 0.2,
      // Scores are user data; never ship them to an error tracker.
      sendDefaultPii: false,
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
