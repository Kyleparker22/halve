import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { queryStore } from './storage';

export const queryClient = new QueryClient({
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
  tripMembers: (id: string) => ['trip', id, 'members'] as const,
  openSeats: ['open-seats'] as const,
  courses: (term: string) => ['courses', term] as const,
  messages: (scope: string, id: string) => ['messages', scope, id] as const,
  feed: (crewId: string) => ['crew', crewId, 'feed'] as const,
};
