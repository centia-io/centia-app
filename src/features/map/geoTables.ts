import { useMemo } from 'react';
import { useTableSummary } from '../../hooks/useSchemaNames';
import { useMetaQuery } from '../../hooks/useMetaQuery';
import type { GeoTable } from './mapStore';

/** GC2 marks relations without a PostGIS geometry column with this placeholder. */
const NON_POSTGIS = 'gc2_non_postgis';

/**
 * Tables with a geometry/geography column in one schema. Read from the
 * tables summary (one catalog query); servers that predate its
 * _geometry_columns fall back to the slower relation metadata.
 */
export function useGeoTables(schema: string | null | undefined) {
  const summary = useTableSummary(schema);
  const hasGeomInfo = summary.data !== undefined && summary.data.every((t) => '_geometry_columns' in t);
  const fallback = summary.data !== undefined && !hasGeomInfo;
  const meta = useMetaQuery(schema ?? '', !!schema && fallback);

  const geoTables = useMemo<GeoTable[]>(() => {
    if (!schema || !summary.data) return [];
    const found = hasGeomInfo
      ? summary.data
          .filter((t) => t._geometry_columns!.length > 0)
          .map((t) => ({ schema, table: t.name, geomColumn: t._geometry_columns![0].name }))
      : Object.entries(
          (meta.data as { relations?: Record<string, { _geometry_column?: string | null }> } | undefined)?.relations ?? {},
        )
          .filter(([, r]) => r._geometry_column && r._geometry_column !== NON_POSTGIS)
          .map(([key, r]) => ({ schema, table: key.slice(schema.length + 1), geomColumn: r._geometry_column! }));
    return found.sort((a, b) => a.table.localeCompare(b.table));
  }, [schema, summary.data, hasGeomInfo, meta.data]);

  return {
    geoTables,
    isLoading: !!schema && (summary.isLoading || (fallback && meta.isLoading)),
    error: summary.error ?? (fallback ? meta.error : null),
  };
}
