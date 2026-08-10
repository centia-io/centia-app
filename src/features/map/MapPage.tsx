import { useState, useEffect, useRef, useCallback } from 'react';
import { Spin, Alert, Switch, Typography, Select, Segmented, Button, Tooltip } from 'antd';
import { BgColorsOutlined, WarningOutlined } from '@ant-design/icons';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getAdminClient } from '../../baas/adminClient';
import { getSql, getStatus } from '../../baas/client';
import { useQuery } from '@tanstack/react-query';
import {
  mapStore,
  useMapStore,
  addActiveLayer,
  removeActiveLayer,
  setRenderMode,
  openStyleEditor,
  type GeoTable,
  type ActiveLayer,
  type RenderMode,
} from './mapStore';
import { computeWmsViewport, fetchWmsImage, wmsLayerName } from './wmsImage';

const { Text } = Typography;

/** Extract tables with geometry/geography columns from schema data. */
function extractGeoTables(schemas: any[]): GeoTable[] {
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

/** Detect the predominant geometry type from a GeoJSON FeatureCollection. */
function detectGeomType(geojson: GeoJSON.FeatureCollection): string | null {
  for (const f of geojson.features) {
    if (f.geometry) return f.geometry.type;
  }
  return null;
}

/** Compute bounding box from GeoJSON features. */
function computeBounds(geojson: GeoJSON.FeatureCollection): maplibregl.LngLatBoundsLike | null {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  let hasCoords = false;

  function visit(coords: any) {
    if (typeof coords[0] === 'number') {
      hasCoords = true;
      if (coords[0] < minLng) minLng = coords[0];
      if (coords[0] > maxLng) maxLng = coords[0];
      if (coords[1] < minLat) minLat = coords[1];
      if (coords[1] > maxLat) maxLat = coords[1];
    } else {
      for (const c of coords) visit(c);
    }
  }

  for (const f of geojson.features) {
    if (f.geometry && 'coordinates' in f.geometry) {
      visit(f.geometry.coordinates);
    }
  }

  if (!hasCoords) return null;
  return [[minLng, minLat], [maxLng, maxLat]];
}

function sourceId(gt: GeoTable) {
  return `${gt.schema}.${gt.table}`;
}

function layerId(gt: GeoTable) {
  return `layer-${gt.schema}.${gt.table}`;
}

function wmsSourceId(gt: GeoTable) {
  return `wms-${gt.schema}.${gt.table}`;
}

export default function MapPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [layerLoading, setLayerLoading] = useState<Set<string>>(new Set());
  const popupRef = useRef<maplibregl.Popup | null>(null);
  /** Track all interactive layer ids so the click handler can query them. */
  const interactiveLayerIds = useRef<Set<string>>(new Set());
  /** Per-WMS-source abort controllers and object URLs. */
  const wmsAborts = useRef<Map<string, AbortController>>(new Map());
  const wmsUrls = useRef<Map<string, string>>(new Map());
  const [wmsErrors, setWmsErrors] = useState<Map<string, string>>(new Map());

  const { selectedSchema, activeLayers, wmsRefresh } = useMapStore();

  const { data: geoTables = [], isLoading: loading, error } = useQuery({
    queryKey: ['schemas'],
    queryFn: async () => await getAdminClient().provisioning.schemas.getSchema() as any[],
    staleTime: 30_000,
    select: extractGeoTables,
  });

  const addLayer = useCallback(async (gt: GeoTable, opts: { fit?: boolean } = {}) => {
    const map = mapRef.current;
    if (!map) return;

    const sid = sourceId(gt);
    const lid = layerId(gt);
    // Guard against duplicate adds on rehydrate
    if (map.getSource(sid)) return;

    setLayerLoading((prev) => new Set(prev).add(sid));

    try {
      // SDK types don't include output_format but the API supports it and
      // the SDK passes the body through as-is.
      const geojson = await getSql().exec({
        q: `SELECT * FROM "${gt.schema}"."${gt.table}" LIMIT 5000`,
        output_format: 'geojson',
      } as any) as unknown as GeoJSON.FeatureCollection;

      if (!geojson.features?.length) return;

      map.addSource(sid, { type: 'geojson', data: geojson });

      const geomType = detectGeomType(geojson);

      if (geomType === 'Point' || geomType === 'MultiPoint') {
        map.addLayer({
          id: lid,
          type: 'circle',
          source: sid,
          paint: {
            'circle-radius': 5,
            'circle-color': '#1677ff',
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 1,
          },
        });
      } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
        map.addLayer({
          id: lid,
          type: 'line',
          source: sid,
          paint: {
            'line-color': '#1677ff',
            'line-width': 2,
          },
        });
      } else {
        // Polygon / MultiPolygon / GeometryCollection fallback
        map.addLayer({
          id: lid,
          type: 'fill',
          source: sid,
          paint: {
            'fill-color': '#1677ff',
            'fill-opacity': 0.3,
          },
        });
        map.addLayer({
          id: `${lid}-outline`,
          type: 'line',
          source: sid,
          paint: {
            'line-color': '#1677ff',
            'line-width': 1,
          },
        });
      }

      interactiveLayerIds.current.add(lid);

      if (opts.fit) {
        const bounds = computeBounds(geojson);
        if (bounds) map.fitBounds(bounds, { padding: 60, maxZoom: 15 });
      }
    } finally {
      setLayerLoading((prev) => {
        const next = new Set(prev);
        next.delete(sid);
        return next;
      });
    }
  }, []);

  const removeLayer = useCallback((gt: GeoTable) => {
    const map = mapRef.current;
    if (!map) return;

    const lid = layerId(gt);
    const sid = sourceId(gt);

    if (map.getLayer(`${lid}-outline`)) map.removeLayer(`${lid}-outline`);
    if (map.getLayer(lid)) map.removeLayer(lid);
    if (map.getSource(sid)) map.removeSource(sid);
    interactiveLayerIds.current.delete(lid);
  }, []);

  /** Fetch a viewport-sized GetMap image and add or update the image source for the layer. */
  const showWms = useCallback(async (gt: GeoTable) => {
    const map = mapRef.current;
    if (!map) return;
    const wid = wmsSourceId(gt);

    wmsAborts.current.get(wid)?.abort();
    const ctrl = new AbortController();
    wmsAborts.current.set(wid, ctrl);

    setLayerLoading((prev) => new Set(prev).add(sourceId(gt)));
    try {
      const viewport = computeWmsViewport(map);
      const url = await fetchWmsImage({
        host: import.meta.env.VITE_CENTIA_HOST,
        schema: gt.schema,
        wmsLayer: wmsLayerName(gt),
        token: getStatus().getTokens().accessToken,
        viewport,
        signal: ctrl.signal,
      });
      if (wmsAborts.current.get(wid) !== ctrl) {
        URL.revokeObjectURL(url);
        return;
      }
      const old = wmsUrls.current.get(wid);
      const src = map.getSource(wid) as maplibregl.ImageSource | undefined;
      if (src) {
        src.updateImage({ url, coordinates: viewport.coordinates });
      } else {
        map.addSource(wid, { type: 'image', url, coordinates: viewport.coordinates });
        map.addLayer({ id: wid, type: 'raster', source: wid, paint: { 'raster-fade-duration': 0 } });
      }
      wmsUrls.current.set(wid, url);
      if (old) URL.revokeObjectURL(old);
      setWmsErrors((prev) => {
        const next = new Map(prev);
        next.delete(wid);
        return next;
      });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setWmsErrors((prev) => new Map(prev).set(wid, e instanceof Error ? e.message : String(e)));
      }
    } finally {
      if (wmsAborts.current.get(wid) === ctrl) {
        setLayerLoading((prev) => {
          const next = new Set(prev);
          next.delete(sourceId(gt));
          return next;
        });
      }
    }
  }, []);

  const removeWms = useCallback((gt: GeoTable) => {
    const map = mapRef.current;
    if (!map) return;
    const wid = wmsSourceId(gt);
    wmsAborts.current.get(wid)?.abort();
    wmsAborts.current.delete(wid);
    if (map.getLayer(wid)) map.removeLayer(wid);
    if (map.getSource(wid)) map.removeSource(wid);
    const url = wmsUrls.current.get(wid);
    if (url) {
      URL.revokeObjectURL(url);
      wmsUrls.current.delete(wid);
    }
    setWmsErrors((prev) => {
      const next = new Map(prev);
      next.delete(wid);
      return next;
    });
  }, []);

  // Initialize map (once per mount) — restore camera + rehydrate active layers from store
  useEffect(() => {
    if (!mapContainer.current) return;

    const cam = mapStore.get().camera;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/bright',
      center: cam?.center ?? [10, 56],
      zoom: cam?.zoom ?? 5,
      bearing: cam?.bearing ?? 0,
      pitch: cam?.pitch ?? 0,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('click', (e) => {
      popupRef.current?.remove();

      const ids = [...interactiveLayerIds.current];
      if (ids.length === 0) return;

      const features = map.queryRenderedFeatures(e.point, { layers: ids });
      if (!features.length) return;

      const feat = features[0];
      const props = feat.properties ?? {};
      const rows = Object.entries(props)
        .map(([k, v]) => `<tr><td style="padding:2px 8px 2px 0;font-weight:600;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:2px 0;word-break:break-all">${v}</td></tr>`)
        .join('');
      const html = `<div style="max-height:300px;overflow:auto"><table style="font-size:12px">${rows}</table></div>`;

      popupRef.current = new maplibregl.Popup({ maxWidth: '360px' })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map);
    });

    map.on('mousemove', (e) => {
      const ids = [...interactiveLayerIds.current];
      if (ids.length === 0) { map.getCanvas().style.cursor = ''; return; }
      const hits = map.queryRenderedFeatures(e.point, { layers: ids });
      map.getCanvas().style.cursor = hits.length ? 'pointer' : '';
    });

    map.on('moveend', () => {
      const c = map.getCenter();
      mapStore.set({
        camera: {
          center: [c.lng, c.lat],
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: map.getPitch(),
        },
      });
    });

    const refreshAllWms = () => {
      for (const al of mapStore.get().activeLayers) {
        if (al.renderMode === 'wms') showWms(al);
      }
    };
    map.on('moveend', refreshAllWms);
    map.on('resize', refreshAllWms);

    map.on('load', () => {
      mapRef.current = map;
      setMapReady(true);
      // Rehydrate layers from store without overriding saved camera
      for (const al of mapStore.get().activeLayers) {
        if (al.renderMode === 'wms') showWms(al);
        else addLayer(al, { fit: false });
      }
    });

    return () => {
      mapRef.current = null;
      setMapReady(false);
      for (const ctrl of wmsAborts.current.values()) ctrl.abort();
      wmsAborts.current.clear();
      for (const url of wmsUrls.current.values()) URL.revokeObjectURL(url);
      wmsUrls.current.clear();
      map.remove();
    };
  }, [addLayer, showWms]);

  useEffect(() => {
    if (!mapReady || wmsRefresh === 0) return;
    for (const al of mapStore.get().activeLayers) {
      if (al.renderMode === 'wms') showWms(al);
    }
  }, [wmsRefresh, mapReady, showWms]);

  const handleToggle = useCallback(
    (gt: GeoTable, checked: boolean) => {
      if (checked) {
        addActiveLayer(gt);
        addLayer(gt, { fit: true });
      } else {
        const al = mapStore
          .get()
          .activeLayers.find((x) => x.schema === gt.schema && x.table === gt.table);
        removeActiveLayer(gt);
        if (al?.renderMode === 'wms') removeWms(gt);
        else removeLayer(gt);
      }
    },
    [addLayer, removeLayer, removeWms],
  );

  const handleModeChange = useCallback(
    (al: ActiveLayer, mode: RenderMode) => {
      if (al.renderMode === mode) return;
      setRenderMode(al, mode);
      if (mode === 'wms') {
        removeLayer(al);
        showWms(al);
      } else {
        removeWms(al);
        addLayer(al, { fit: false });
      }
    },
    [addLayer, removeLayer, showWms, removeWms],
  );

  const schemas = [...new Set(geoTables.map((gt) => gt.schema))];
  const visibleTables = selectedSchema
    ? geoTables.filter((gt) => gt.schema === selectedSchema)
    : [];

  const isActive = (gt: GeoTable) =>
    activeLayers.some((x) => x.schema === gt.schema && x.table === gt.table);

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* Layer sidebar */}
      <div
        style={{
          width: 280,
          minWidth: 280,
          borderRight: '1px solid #f0f0f0',
          overflow: 'auto',
          padding: '12px 0',
        }}
      >
        <div style={{ padding: '0 16px 12px' }}>
          <Text strong style={{ fontSize: 16 }}>Layers</Text>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        )}

        {error && <Alert type="error" message={String(error)} style={{ margin: '0 12px' }} />}

        {!loading && geoTables.length === 0 && !error && (
          <Text type="secondary" style={{ padding: '0 16px' }}>
            No tables with geometry columns found.
          </Text>
        )}

        {schemas.length > 0 && (
          <>
            <div style={{ padding: '0 16px 12px' }}>
              <Select
                placeholder="Select schema"
                value={selectedSchema}
                onChange={(v) => mapStore.set({ selectedSchema: v })}
                style={{ width: '100%' }}
                options={schemas.map((s) => ({ label: s, value: s }))}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px' }}>
              {visibleTables.map((gt) => {
                const sid = sourceId(gt);
                const al = activeLayers.find((x) => x.schema === gt.schema && x.table === gt.table);
                const err = wmsErrors.get(wmsSourceId(gt));
                return (
                  <div key={sid} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text ellipsis style={{ flex: 1, marginRight: 8 }}>
                        {gt.table}
                      </Text>
                      {err && (
                        <Tooltip title={err}>
                          <WarningOutlined style={{ color: '#faad14', marginRight: 4 }} />
                        </Tooltip>
                      )}
                      <Tooltip title="Edit WMS styling">
                        <Button
                          size="small"
                          type="text"
                          icon={<BgColorsOutlined />}
                          onClick={() => openStyleEditor(gt)}
                        />
                      </Tooltip>
                      <Switch
                        size="small"
                        checked={isActive(gt)}
                        loading={layerLoading.has(sid)}
                        disabled={!mapReady}
                        onChange={(checked) => handleToggle(gt, checked)}
                      />
                    </div>
                    {al && (
                      <Segmented
                        size="small"
                        block
                        value={al.renderMode}
                        options={[
                          { label: 'GeoJSON', value: 'geojson' },
                          { label: 'WMS', value: 'wms' },
                        ]}
                        onChange={(v) => handleModeChange(al, v as RenderMode)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Map area */}
      <div ref={mapContainer} style={{ flex: 1, minHeight: 0 }} />
    </div>
  );
}
