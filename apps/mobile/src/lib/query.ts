import Constants from 'expo-constants';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { queryStore } from './storage';
import { captureError } from './analytics';

/**
 * Every failed query and mutation reports itself. Without this Sentry only ever
 * hears about native crashes — and the failures that actually matter here are
 * the quiet ones: a settle that 403s, a score that will not flush. Those render
 * as an error note and are otherwise invisible to us.
 *
 * Offline is not an error. A phone in a bunker with no signal is the expected
 * case for this app, and reporting it would bury the real failures in noise.
 */
const isOffline = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /network request failed|fetch failed|offline|timeout/i.test(message);
};

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (isOffline(error)) return;
      captureError(error, { kind: 'query', queryKey: query.queryKey });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      if (isOffline(error)) return;
      captureError(error, { kind: 'mutation', mutationKey: mutation.options.mutationKey });
    },
  }),
  defaultOptions: {
    queries: {
      // A round in progress must render from cache with no network at all.
      staleTime: 30_000,
      gcTime: 1000 * 60 * 60 * 24 * 7,
      retry: 2,
      refetchOnWindowFocus: false,
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
});

/** MMKV behind the AsyncStorage shape the persister expects. */
export const persister = createAsyncStoragePersister({
  storage: {
    getItem: async (key: string) => queryStore.getString(key) ?? null,
    setItem: async (key: string, value: string) => {
      queryStore.set(key, value);
    },
    removeItem: async (key: string) => {
      queryStore.remove(key);
    },
  },
  key: 'halve.query-cache',
  throttleTime: 1000,
});

/**
 * Bump with any change to a cached payload's shape. Without it, an update that
 * adds a field reads it back as undefined from a cache written by the previous
 * build — which surfaces as a render crash on someone else's phone, not yours.
 */
export const CACHE_BUSTER = `${Constants.expoConfig?.version ?? '0'}-2`;

export const queryKeys = {
  session: ['session'] as const,
  profile: (id: string) => ['profile', id] as const,
  crews: ['crews'] as const,
  crew: (id: string) => ['crew', id] as const,
  crewMembers: (id: string) => ['crew', id, 'members'] as const,
  crewGuests: (id: string) => ['crew', id, 'guests'] as const,
  crewLedger: (id: string) => ['crew', id, 'ledger'] as const,
  crewBalances: (id: string) => ['crew', id, 'balances'] as const,
  rounds: ['rounds'] as const,
  round: (id: string) => ['round', id] as const,
  roundBundle: (id: string) => ['round', id, 'bundle'] as const,
  roundScores: (id: string) => ['round', id, 'scores'] as const,
  roundGames: (id: string) => ['round', id, 'games'] as const,
  gameResults: (roundId: string) => ['round', roundId, 'results'] as const,
  trips: ['trips'] as const,
  trip: (id: string) => ['trip', id] as const,
  tripExpenses: (id: string) => ['trip', id, 'expenses'] as const,
  tripBalances: (id: string) => ['trip', id, 'balances'] as const,
  tripLedger: (id: string) => ['trip', id, 'ledger'] as const,
  tripMembers: (id: string) => ['trip', id, 'members'] as const,
  openSeats: ['open-seats'] as const,
  courses: (term: string) => ['courses', term] as const,
  messages: (scope: string, id: string) => ['messages', scope, id] as const,
  feed: (crewId: string) => ['crew', crewId, 'feed'] as const,
};
