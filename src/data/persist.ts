import type { PersistedClient, Persister } from '@tanstack/query-persist-client-core';
import { get, set, del } from 'idb-keyval';

const IDB_KEY = 'centia-query-cache';

/**
 * IndexedDB persister for TanStack Query.
 * Stores/restores the dehydrated query cache using idb-keyval.
 *
 * Security: Only query data is persisted (responses from SDK calls).
 * Access tokens are NOT part of query data — they live in the auth layer.
 */
export function createIdbPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      await set(IDB_KEY, client);
    },
    restoreClient: async () => {
      return await get<PersistedClient>(IDB_KEY);
    },
    removeClient: async () => {
      await del(IDB_KEY);
    },
  };
}
