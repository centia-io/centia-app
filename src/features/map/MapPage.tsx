import { useState, useEffect, useRef, useCallback } from 'react';
import { Spin, Alert, Switch, Typography, Select, Segmented, Button, Tooltip } from 'antd';
import { BgColorsOutlined, SaveOutlined, WarningOutlined } from '@ant-design/icons';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { message } from '../../utils/message';
import { Mapcache } from '@centia-io/sdk';
import { useAuth } from '../../auth/AuthProvider';
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
import LayerStyleDrawer from './LayerStyleDrawer';
import { extractGeoTables } from './geoTables';

const { Text } = Typography;

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

function tilesSourceId(gt: GeoTable) {
  return `tiles-${gt.schema}.${gt.table}`;
}

function mvtSourceId(gt: GeoTable) {
  return `mvt-${gt.schema}.${gt.table}`;
}

type TileMode = 'tiles' | 'mvt';

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
  const { user } = useAuth();
  const database = (user?.database as string) ?? '';

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

      // Bail if the layer was toggled off or switched away from GeoJSON while the fetch was in flight.
      const current = mapStore
        .get()
        .activeLayers.find((x) => x.schema === gt.schema && x.table === gt.table);
      if (!current || current.renderMode !== 'geojson') return;

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
    setLayerLoading((prev) => {
      const next = new Set(prev);
      next.delete(sourceId(gt));
      return next;
    });
  }, []);

  /** Add a cached raster-tile or vector-tile rendering for the layer via the MapCache proxy. */
  const showTiles = useCallback(
    (gt: GeoTable, mode: TileMode) => {
      const map = mapRef.current;
      if (!map || !database) return;
      const mc = new Mapcache(getAdminClient().http);
      if (mode === 'tiles') {
        const sid = tilesSourceId(gt);
        if (map.getSource(sid)) return;
        map.addSource(sid, {
          type: 'raster',
          tiles: [mc.mapcacheUrl(database, `tms/1.0.0/${gt.schema}.${gt.table}@g20/{z}/{x}/{y}.png`)],
          tileSize: 256,
          scheme: 'tms',
        });
        map.addLayer({ id: sid, type: 'raster', source: sid });
      } else {
        const sid = mvtSourceId(gt);
        if (map.getSource(sid)) return;
        const sourceLayer = `${gt.schema}.${gt.table}`;
        map.addSource(sid, {
          type: 'vector',
          tiles: [mc.mapcacheUrl(database, `tms/1.0.0/${gt.schema}.${gt.table}.mvt@g20/{z}/{x}/{y}.mvt`)],
          scheme: 'tms',
        });
        map.addLayer({
          id: `${sid}-fill`,
          type: 'fill',
          source: sid,
          'source-layer': sourceLayer,
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: { 'fill-color': '#1677ff', 'fill-opacity': 0.3 },
        });
        map.addLayer({
          id: `${sid}-line`,
          type: 'line',
          source: sid,
          'source-layer': sourceLayer,
          paint: { 'line-color': '#1677ff', 'line-width': 1.5 },
        });
        map.addLayer({
          id: `${sid}-circle`,
          type: 'circle',
          source: sid,
          'source-layer': sourceLayer,
          filter: ['==', ['geometry-type'], 'Point'],
          paint: {
            'circle-radius': 5,
            'circle-color': '#1677ff',
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 1,
          },
        });
        interactiveLayerIds.current.add(`${sid}-fill`);
        interactiveLayerIds.current.add(`${sid}-line`);
        interactiveLayerIds.current.add(`${sid}-circle`);
      }
    },
    [database],
  );

  const removeTiles = useCallback((gt: GeoTable, mode: TileMode) => {
    const map = mapRef.current;
    if (!map) return;
    if (mode === 'tiles') {
      const sid = tilesSourceId(gt);
      if (map.getLayer(sid)) map.removeLayer(sid);
      if (map.getSource(sid)) map.removeSource(sid);
    } else {
      const sid = mvtSourceId(gt);
      for (const suffix of ['-fill', '-line', '-circle']) {
        if (map.getLayer(sid + suffix)) map.removeLayer(sid + suffix);
        interactiveLayerIds.current.delete(sid + suffix);
      }
      if (map.getSource(sid)) map.removeSource(sid);
    }
  }, []);

  /** Add the rendering matching the layer's mode. */
  const applyRendering = useCallback(
    (al: ActiveLayer, opts: { fit?: boolean } = {}) => {
      if (al.renderMode === 'wms') showWms(al);
      else if (al.renderMode === 'tiles' || al.renderMode === 'mvt') showTiles(al, al.renderMode);
      else addLayer(al, { fit: opts.fit ?? false });
    },
    [showWms, showTiles, addLayer],
  );

  /** Remove the rendering matching the layer's mode. */
  const removeRendering = useCallback(
    (al: ActiveLayer) => {
      if (al.renderMode === 'wms') removeWms(al);
      else if (al.renderMode === 'tiles' || al.renderMode === 'mvt') removeTiles(al, al.renderMode);
      else removeLayer(al);
    },
    [removeWms, removeTiles, removeLayer],
  );

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
      // MapCache tiles are authorized per request; the token cannot live in the URL.
      transformRequest: (url) => {
        if (url.includes('/api/v4/mapcache/')) {
          return { url, headers: { Authorization: `Bearer ${getStatus().getTokens().accessToken}` } };
        }
        return undefined;
      },
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
        applyRendering(al);
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
  }, [addLayer, showWms, applyRendering]);

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
        if (al) removeRendering(al);
        else removeLayer(gt);
      }
    },
    [addLayer, removeLayer, removeRendering],
  );

  const handleModeChange = useCallback(
    (al: ActiveLayer, mode: RenderMode) => {
      if (al.renderMode === mode) return;
      removeRendering(al);
      setRenderMode(al, mode);
      applyRendering({ ...al, renderMode: mode });
    },
    [applyRendering, removeRendering],
  );

  /** Fly to the schema's saved start view (extent wins over center/zoom). All EPSG:4326. */
  const applySchemaView = useCallback(async (schema: string) => {
    const map = mapRef.current;
    if (!map) return;
    try {
      const cfg = await getAdminClient().provisioning.maps.getMap(schema);
      if (cfg.extent) {
        const [minx, miny, maxx, maxy] = cfg.extent;
        map.fitBounds(
          [
            [minx, miny],
            [maxx, maxy],
          ],
          { padding: 0 },
        );
      } else if (cfg.center) {
        map.jumpTo({
          center: [cfg.center[0], cfg.center[1]],
          zoom: cfg.zoom ?? map.getZoom(),
        });
      }
    } catch (e) {
      message.error(getErrorMessage(e));
    }
  }, []);

  const handleSchemaChange = useCallback(
    (schema: string) => {
      mapStore.set({ selectedSchema: schema });
      applySchemaView(schema);
    },
    [applySchemaView],
  );

  /** Save the current viewport as the selected schema's start view. All EPSG:4326. */
  const saveSchemaView = useCallback(async () => {
    const map = mapRef.current;
    const schema = mapStore.get().selectedSchema;
    if (!map || !schema) return;
    const c = map.getCenter();
    const b = map.getBounds();
    try {
      await getAdminClient().provisioning.maps.patchMap(schema, {
        center: [c.lng, c.lat],
        zoom: map.getZoom(),
        extent: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
      });
      message.success(`Start view saved for "${schema}"`);
    } catch (e) {
      message.error(getErrorMessage(e));
    }
  }, []);

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
            <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px' }}>
              <Select
                placeholder="Select schema"
                value={selectedSchema}
                onChange={handleSchemaChange}
                style={{ flex: 1 }}
                options={schemas.map((s) => ({ label: s, value: s }))}
              />
              <Tooltip title="Save current view as this schema's start view">
                <Button
                  icon={<SaveOutlined />}
                  disabled={!selectedSchema || !mapReady}
                  onClick={saveSchemaView}
                />
              </Tooltip>
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
                          { label: 'Tiles', value: 'tiles' },
                          { label: 'MVT', value: 'mvt' },
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

      <LayerStyleDrawer />
    </div>
  );
}
