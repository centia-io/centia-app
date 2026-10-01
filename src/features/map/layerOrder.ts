import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { getMeta } from '../../baas/client';
import type { GeoTable } from './mapStore';

type Relations = Record<string, { sort_id?: number | null }>;

/**
 * Layer order from the relations' sort_id metadata: highest sort_id first
 * (top of the list, drawn on top of the map), layers without a sort_id
 * last, ties by table name. Metadata is read per schema under the same key
 * as useMetaQuery, so it shares that cache.
 */
export function useLayerOrder(schemas: (string | null | undefined)[]) {
  const unique = [...new Set(schemas.filter((s): s is string => !!s))].sort();
  const metas = useQueries({
    queries: unique.map((s) => ({
      queryKey: ['metadata', s],
      queryFn: () => getMeta().query(s),
      staleTime: 30_000,
    })),
  });
  const metasKey = metas.map((q) => q.dataUpdatedAt).join(',');

  return useMemo(() => {
    const sortIds = new Map<string, number>();
    for (const q of metas) {
      const relations = (q.data as { relations?: Relations } | undefined)?.relations ?? {};
      for (const [key, r] of Object.entries(relations)) {
        if (typeof r.sort_id === 'number') sortIds.set(key, r.sort_id);
      }
    }
    const sortIdOf = (gt: GeoTable) => sortIds.get(`${gt.schema}.${gt.table}`) ?? null;
    const compare = (a: GeoTable, b: GeoTable) => {
      const sa = sortIdOf(a);
      const sb = sortIdOf(b);
      if (sa !== sb) {
        if (sa === null) return 1;
        if (sb === null) return -1;
        return sb - sa;
      }
      return a.table.localeCompare(b.table) || a.schema.localeCompare(b.schema);
    };
    return { compare, sortIdOf };
  }, [metasKey]);
}
