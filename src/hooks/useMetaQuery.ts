import { useQuery } from '@tanstack/react-query';
import { getMeta } from '../baas/client';
import { queryClient } from '../data/queryClient';

export function useMetaQuery(rel: string, enabled = true) {
  return useQuery({
    queryKey: ['metadata', rel],
    queryFn: () => getMeta().query(rel),
    enabled,
    staleTime: 30_000,
  });
}

export function invalidateMeta(rel: string) {
  return queryClient.invalidateQueries({ queryKey: ['metadata', rel] });
}
