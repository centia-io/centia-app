import { useQuery } from '@tanstack/react-query';
import { Mapcache } from '@centia-io/sdk';
import { getAdminClient } from '../../baas/adminClient';
import { getSql } from '../../baas/client';
import { useTableSummary } from '../../hooks/useSchemaNames';

export type TileKind = 'raster' | 'mvt' | 'json';

export interface SeedTileset {
  /** The tileset name the seeder expects, e.g. "schema.table" or "schema.table.mvt". */
  id: string;
  title: string;
  /** Grid names (not titles) the tileset declares. */
  grids: string[];
  /** Raster image tiles, or the .mvt / .json vector variants. */
  kind: TileKind;
}

export interface SeedGrid {
  id: string;
  crs: string | null;
  /** Zoom level numbers, ascending. */
  levels: number[];
  /** Tiles per level (MatrixWidth × MatrixHeight), index-aligned with levels. */
  tilesPerLevel: number[];
}

export interface SeedCapabilities {
  tilesets: SeedTileset[];
  grids: Record<string, SeedGrid>;
}

const OWS = 'http://www.opengis.net/ows/1.1';

/** The direct child element's text, ignoring namesakes in nested elements. */
function childText(el: Element, ns: string | null, name: string): string | null {
  for (const c of Array.from(el.children)) {
    if (c.localName === name && (ns === null || c.namespaceURI === ns)) return c.textContent?.trim() ?? null;
  }
  return null;
}

function parse(xml: string): SeedCapabilities {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const contents = Array.from(doc.documentElement.children).find((c) => c.localName === 'Contents');
  const tilesets: SeedTileset[] = [];
  const grids: Record<string, SeedGrid> = {};
  for (const el of Array.from(contents?.children ?? [])) {
    if (el.localName === 'Layer') {
      const id = childText(el, OWS, 'Identifier');
      if (!id) continue;
      const linked = Array.from(el.children)
        .filter((c) => c.localName === 'TileMatrixSetLink')
        .map((l) => childText(l, null, 'TileMatrixSet'))
        .filter((g): g is string => !!g);
      tilesets.push({
        id,
        title: childText(el, OWS, 'Title') ?? id,
        grids: [...new Set(linked)],
        kind: id.endsWith('.mvt') ? 'mvt' : id.endsWith('.json') ? 'json' : 'raster',
      });
    } else if (el.localName === 'TileMatrixSet') {
      const id = childText(el, OWS, 'Identifier');
      if (!id) continue;
      const matrices = Array.from(el.children)
        .filter((c) => c.localName === 'TileMatrix')
        .map((m) => ({
          level: Number(childText(m, OWS, 'Identifier')),
          tiles: Number(childText(m, null, 'MatrixWidth')) * Number(childText(m, null, 'MatrixHeight')),
        }))
        .filter((m) => Number.isFinite(m.level))
        .sort((a, b) => a.level - b.level);
      grids[id] = {
        id,
        crs: childText(el, OWS, 'SupportedCRS'),
        levels: matrices.map((m) => m.level),
        tilesPerLevel: matrices.map((m) => (Number.isFinite(m.tiles) ? m.tiles : 0)),
      };
    }
  }
  tilesets.sort((a, b) => a.id.localeCompare(b.id));
  return { tilesets, grids };
}

/**
 * Tilesets, their grids and each grid's zoom levels, from the database's
 * WMTS capabilities — the same MapCache config the seeder validates
 * against. The document is large, so it is fetched once and cached.
 */
export function useSeedCapabilities(database: string) {
  return useQuery({
    queryKey: ['mapcache-capabilities', database],
    queryFn: async () =>
      parse(
        await new Mapcache(getAdminClient().http).getMapcache<string>(database, 'wmts', {
          SERVICE: 'WMTS',
          REQUEST: 'GetCapabilities',
        }),
      ),
    enabled: !!database,
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
  });
}

export type BBox = [number, number, number, number];

/**
 * A layer's approximate WGS84 extent from the table statistics
 * (ST_EstimatedExtent — no table scan). Null when the layer has no
 * geometry column or no statistics yet.
 */
export function useEstimatedExtent(layer: string | undefined) {
  const [schema, table] = layer && layer.includes('.') ? [layer.slice(0, layer.indexOf('.')), layer.slice(layer.indexOf('.') + 1)] : [undefined, undefined];
  const summary = useTableSummary(schema);
  const geom = summary.data?.find((t) => t.name === table)?._geometry_columns?.[0]?.name;
  return useQuery({
    queryKey: ['estimated-extent', schema, table, geom],
    queryFn: async (): Promise<BBox | null> => {
      const res = await getSql().exec({
        q: `SELECT ST_XMin(b) AS xmin, ST_YMin(b) AS ymin, ST_XMax(b) AS xmax, ST_YMax(b) AS ymax
            FROM (SELECT ST_Transform(ST_SetSRID(ST_EstimatedExtent(:s, :t, :g)::geometry, Find_SRID(:s, :t, :g)), 4326) AS b) AS e`,
        params: [{ s: schema, t: table, g: geom }],
      });
      const r = res.data[0] as { xmin: number | null; ymin: number | null; xmax: number | null; ymax: number | null } | undefined;
      return r && r.xmin !== null ? [r.xmin, r.ymin!, r.xmax!, r.ymax!] : null;
    },
    enabled: !!schema && !!table && !!geom,
    staleTime: 10 * 60_000,
    retry: false,
  });
}

/**
 * True for a standard Web Mercator pyramid: level z has 4^z tiles. MapCache
 * rounds the deepest levels (g20's z27 is 134217670² instead of 2^27²), hence
 * the tolerance.
 */
export function isWebMercatorPyramid(grid: SeedGrid): boolean {
  return (
    grid.levels.length > 0 &&
    grid.levels.every((z, i) => Math.abs(grid.tilesPerLevel[i] / 4 ** z - 1) < 0.001)
  );
}

/** Tiles covering a WGS84 bbox over a zoom range in a Web Mercator pyramid. */
export function tilesInBBox([minLon, minLat, maxLon, maxLat]: BBox, from: number, to: number): number {
  const lat = (v: number) => Math.max(-85.05112878, Math.min(85.05112878, v));
  const tx = (lon: number, n: number) => Math.min(n - 1, Math.floor(((lon + 180) / 360) * n));
  const ty = (la: number, n: number) => {
    const r = (lat(la) * Math.PI) / 180;
    return Math.min(n - 1, Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n));
  };
  let sum = 0;
  for (let z = from; z <= to; z++) {
    const n = 2 ** z;
    sum += (tx(maxLon, n) - tx(minLon, n) + 1) * (ty(minLat, n) - ty(maxLat, n) + 1);
  }
  return sum;
}
