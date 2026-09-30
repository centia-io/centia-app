import { useQuery } from '@tanstack/react-query';
import type { SchemaInfo, TableInfo } from '@centia-io/sdk';
import { getAdminClient } from '../baas/adminClient';

/**
 * One cache entry per list, shared by every page, so each list is fetched
 * once and a single invalidation refreshes it everywhere. The schema
 * collection (data/collections/schemas.ts) uses SCHEMAS_KEY too.
 */
export const SCHEMAS_KEY = ['schemas'] as const;
export const tableSummaryKey = (schema: string | null | undefined) => ['tables', schema] as const;

export type SchemaNameItem = SchemaInfo;

/** A table summary; the underscore fields are read-only and absent on older servers. */
export type TableSummary = TableInfo & {
  _geometry_columns?: { name: string; type: string; srid: number }[];
  _columns?: string[];
};

/** All schemas with name and _table_count (namesOnly — one catalog query). */
export function useSchemaNames() {
  return useQuery({
    queryKey: SCHEMAS_KEY,
    queryFn: async () => await getAdminClient().provisioning.schemas.getSchema(undefined, { namesOnly: true }),
    staleTime: 30_000,
  });
}

export function fetchTableSummary(schema: string) {
  return getAdminClient().provisioning.tables.getTable(schema, undefined, { namesOnly: true }) as Promise<
    TableSummary[]
  >;
}

/** A schema's relations as summaries (namesOnly — one catalog query), without full definitions. */
export function useTableSummary(schema: string | null | undefined) {
  return useQuery({
    queryKey: tableSummaryKey(schema),
    queryFn: async () => await fetchTableSummary(schema!),
    enabled: !!schema,
    staleTime: 30_000,
  });
}
