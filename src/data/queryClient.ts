import { QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/query-persist-client-core';
import { CLIENT_FIRST_PERSIST } from './featureFlags';
import { createIdbPersister } from './persist';

/**
 * Shared QueryClient for the entire app.
 *
 * - staleTime: 30s — serve cached data instantly, background refetch after stale
 * - gcTime: 24h — keep unused cache entries for persistence across sessions
 * - refetchOnWindowFocus: true — auto-refresh when user returns to tab
 * - retry: 1 — single retry on failure
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: CLIENT_FIRST_PERSIST ? 1000 * 60 * 60 * 24 : 1000 * 60 * 5,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

/**
 * Initialize IndexedDB persistence if the flag is enabled.
 * Must be called once at app startup (after queryClient is created).
 */
export function initPersistence() {
  if (!CLIENT_FIRST_PERSIST) return;

  persistQueryClient({
    queryClient,
    persister: createIdbPersister(),
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
  });
}
