import type { Map as MapLibreMap } from 'maplibre-gl';

/** WMS layer name for a geometry table. Single source of truth for the GetMap LAYERS param. */
export function wmsLayerName(gt: { schema: string; table: string }): string {
  return `${gt.schema}.${gt.table}`;
}

const EARTH = 20037508.342789244;
/** Web-mercator latitude limit. */
const MAX_LAT = 85.06;

export function lngToMercX(lng: number): number {
  return (lng * EARTH) / 180;
}

export function latToMercY(lat: number): number {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const y = Math.log(Math.tan(((90 + clamped) * Math.PI) / 360)) / (Math.PI / 180);
  return (y * EARTH) / 180;
}

export interface WmsViewport {
  /** EPSG:3857 minx, miny, maxx, maxy. */
  bbox: [number, number, number, number];
  width: number;
  height: number;
  /** Image corners for a MapLibre image source: TL, TR, BR, BL (lng/lat). */
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
}

export function computeWmsViewport(map: MapLibreMap, maxPixels = 2048): WmsViewport {
  const b = map.getBounds();
  const west = b.getWest();
  const east = b.getEast();
  const south = Math.max(b.getSouth(), -MAX_LAT);
  const north = Math.min(b.getNorth(), MAX_LAT);

  const minx = lngToMercX(west);
  const maxx = lngToMercX(east);
  const miny = latToMercY(south);
  const maxy = latToMercY(north);

  const aspect = (maxy - miny) / (maxx - minx);
  let width = Math.min(map.getCanvas().clientWidth || 1024, maxPixels);
  let height = Math.round(width * aspect);
  if (height > maxPixels) {
    height = maxPixels;
    width = Math.round(height / aspect);
  }

  return {
    bbox: [minx, miny, maxx, maxy],
    width,
    height,
    coordinates: [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ],
  };
}

/**
 * Fetch a WMS GetMap image and return it as an object URL.
 * Raw HTTP by design: binary GetMap is a documented gap in the SDK's Ows wrapper.
 */
export async function fetchWmsImage(opts: {
  host: string;
  schema: string;
  wmsLayer: string;
  token: string;
  viewport: WmsViewport;
  signal?: AbortSignal;
}): Promise<string> {
  const { bbox, width, height } = opts.viewport;
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.1.1',
    REQUEST: 'GetMap',
    LAYERS: opts.wmsLayer,
    STYLES: '',
    SRS: 'EPSG:3857',
    BBOX: bbox.join(','),
    WIDTH: String(width),
    HEIGHT: String(height),
    FORMAT: 'image/png',
    TRANSPARENT: 'true',
  });
  const url = `${opts.host}/api/v4/ows/schema/${encodeURIComponent(opts.schema)}?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${opts.token}` },
    signal: opts.signal,
  });
  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || !contentType.startsWith('image/')) {
    const text = await res.text();
    const m = text.match(/<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/);
    throw new Error(m ? m[1].trim() : `WMS request failed (${res.status})`);
  }
  return URL.createObjectURL(await res.blob());
}
