import type { GeoTable } from './mapStore';

/** Extract tables with geometry/geography columns from schema data. */
export function extractGeoTables(schemas: any[]): GeoTable[] {
  const result: GeoTable[] = [];
  for (const s of schemas) {
    const tables: any[] = s.tables ?? [];
    for (const t of tables) {
      const cols: any[] = t.columns ?? [];
      const geomCol = cols.find(
        (c: any) =>
          c.type === 'geometry' ||
          c.type === 'geography' ||
          c.type?.startsWith('geometry(') ||
          c.type?.startsWith('geography('),
      );
      if (geomCol) {
        result.push({ schema: s.name, table: t.name, geomColumn: geomCol.name });
      }
    }
  }
  return result;
}
