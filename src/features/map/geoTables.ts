import { useMemo } from 'react';
import { useMetaQuery } from '../../hooks/useMetaQuery';
import type { GeoTable } from './mapStore';

/** GC2 marks relations without a PostGIS geometry column with this placeholder. */
const NON_POSTGIS = 'gc2_non_postgis';

/**
 * Tables with a geometry/geography column in one schema, from the relation
 * metadata — far cheaper than the full schema definition, and it respects
 * the caller's privileges.
 */
export function useGeoTables(schema: string | null | undefined) {
  const { data, isLoading, error } = useMetaQuery(schema ?? '', !!schema);
  const geoTables = useMemo<GeoTable[]>(() => {
    if (!schema) return [];
    const relations: Record<string, { _geometry_column?: string | null }> =
      (data as { relations?: Record<string, { _geometry_column?: string | null }> } | undefined)?.relations ?? {};
    return Object.entries(relations)
      .filter(([, r]) => r._geometry_column && r._geometry_column !== NON_POSTGIS)
      .map(([key, r]) => ({ schema, table: key.slice(schema.length + 1), geomColumn: r._geometry_column! }))
      .sort((a, b) => a.table.localeCompare(b.table));
  }, [data, schema]);
  return { geoTables, isLoading: !!schema && isLoading, error };
}
