import { useState, useEffect, useRef, useCallback } from 'react';
import { Spin, Alert, Switch, Typography, Select } from 'antd';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getAdminClient } from '../../baas/adminClient';
import { getSql } from '../../baas/client';
import { useQuery } from '@tanstack/react-query';

const { Text } = Typography;

interface GeoTable {
  schema: string;
  table: string;
  geomColumn: string;
}

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

export default function MapPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedSchema, setSelectedSchema] = useState<string | null>(null);
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set());
  const [layerLoading, setLayerLoading] = useState<Set<string>>(new Set());
  const popupRef = useRef<maplibregl.Popup | null>(null);
  /** Track all interactive layer ids so the click handler can query them. */
  const interactiveLayerIds = useRef<Set<string>>(new Set());

  const { data: geoTables = [], isLoading: loading, error } = useQuery({
    queryKey: ['schemas'],
    queryFn: async () => await getAdminClient().provisioning.schemas.getSchema() as any[],
    staleTime: 30_000,
    select: extractGeoTables,
  });

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/bright',
      center: [10, 56],
      zoom: 5,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('click', (e) => {
      // Close any existing popup
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

    // Pointer cursor on hover over interactive layers
    map.on('mousemove', (e) => {
      const ids = [...interactiveLayerIds.current];
      if (ids.length === 0) { map.getCanvas().style.cursor = ''; return; }
      const hits = map.queryRenderedFeatures(e.point, { layers: ids });
      map.getCanvas().style.cursor = hits.length ? 'pointer' : '';
    });

    map.on('load', () => {
      mapRef.current = map;
      setMapReady(true);
    });

    return () => {
      mapRef.current = null;
      setMapReady(false);
      map.remove();
    };
  }, []);

  const addLayer = useCallback(async (gt: GeoTable) => {
    const map = mapRef.current;
    if (!map) return;

    const id = sourceId(gt);
    setLayerLoading((prev) => new Set(prev).add(id));

    try {
      // SDK types don't include output_format but the API supports it and
      // the SDK passes the body through as-is.
      const geojson = await getSql().exec({
        q: `SELECT * FROM "${gt.schema}"."${gt.table}" LIMIT 5000`,
        output_format: 'geojson',
      } as any) as unknown as GeoJSON.FeatureCollection;

      if (!geojson.features?.length) return;

      map.addSource(id, { type: 'geojson', data: geojson });

      const geomType = detectGeomType(geojson);

      if (geomType === 'Point' || geomType === 'MultiPoint') {
        map.addLayer({
          id: layerId(gt),
          type: 'circle',
          source: id,
          paint: {
            'circle-radius': 5,
            'circle-color': '#1677ff',
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 1,
          },
        });
      } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
        map.addLayer({
          id: layerId(gt),
          type: 'line',
          source: id,
          paint: {
            'line-color': '#1677ff',
            'line-width': 2,
          },
        });
      } else {
        // Polygon / MultiPolygon / GeometryCollection fallback
        map.addLayer({
          id: layerId(gt),
          type: 'fill',
          source: id,
          paint: {
            'fill-color': '#1677ff',
            'fill-opacity': 0.3,
          },
        });
        map.addLayer({
          id: `${layerId(gt)}-outline`,
          type: 'line',
          source: id,
          paint: {
            'line-color': '#1677ff',
            'line-width': 1,
          },
        });
      }

      // Register as interactive (use main layer id, not outline)
      interactiveLayerIds.current.add(layerId(gt));

      const bounds = computeBounds(geojson);
      if (bounds) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 15 });
      }

      setActiveLayers((prev) => new Set(prev).add(id));
    } finally {
      setLayerLoading((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const removeLayer = useCallback((gt: GeoTable) => {
    const map = mapRef.current;
    if (!map) return;

    const lid = layerId(gt);
    const sid = sourceId(gt);

    // Remove outline layer if present (polygon case)
    if (map.getLayer(`${lid}-outline`)) map.removeLayer(`${lid}-outline`);
    if (map.getLayer(lid)) map.removeLayer(lid);
    if (map.getSource(sid)) map.removeSource(sid);
    interactiveLayerIds.current.delete(lid);

    setActiveLayers((prev) => {
      const next = new Set(prev);
      next.delete(sid);
      return next;
    });
  }, []);

  const handleToggle = useCallback(
    (gt: GeoTable, checked: boolean) => {
      if (checked) addLayer(gt);
      else removeLayer(gt);
    },
    [addLayer, removeLayer],
  );

  const schemas = [...new Set(geoTables.map((gt) => gt.schema))];
  const visibleTables = selectedSchema
    ? geoTables.filter((gt) => gt.schema === selectedSchema)
    : [];

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
                onChange={setSelectedSchema}
                style={{ width: '100%' }}
                options={schemas.map((s) => ({ label: s, value: s }))}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px' }}>
              {visibleTables.map((gt) => {
                const id = sourceId(gt);
                return (
                  <div
                    key={id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text ellipsis style={{ flex: 1, marginRight: 8 }}>
                      {gt.table}
                    </Text>
                    <Switch
                      size="small"
                      checked={activeLayers.has(id)}
                      loading={layerLoading.has(id)}
                      disabled={!mapReady}
                      onChange={(checked) => handleToggle(gt, checked)}
                    />
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
