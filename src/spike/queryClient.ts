import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30s — serve cached data, refetch in background after stale
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});
