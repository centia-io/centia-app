import { useState } from 'react';
import { Alert, Card, Select, Space, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Mapcache } from '@centia-io/sdk';
import { getAdminClient } from '../../baas/adminClient';
import { useAuth } from '../../auth/AuthProvider';
import { extractGeoTables } from '../map/geoTables';
import UrlField from './UrlField';

const { Text } = Typography;

const GRID_OPTIONS = [
  { label: 'g20 (Web Mercator, EPSG:3857)', value: 'g20' },
  { label: '25832 (ETRS89 / UTM32N)', value: '25832' },
];

export default function TileCachePage() {
  const { user } = useAuth();
  const database = (user?.database as string) ?? '';

  const [schema, setSchema] = useState<string | null>(null);
  const [table, setTable] = useState<string | null>(null);
  const [grid, setGrid] = useState('g20');

  const { data: geoTables = [], isLoading } = useQuery({
    queryKey: ['schemas'],
    queryFn: async () => (await getAdminClient().provisioning.schemas.getSchema()) as any[],
    staleTime: 30_000,
    select: extractGeoTables,
  });

  const schemas = [...new Set(geoTables.map((gt) => gt.schema))].sort();
  const tables = geoTables
    .filter((gt) => gt.schema === schema)
    .map((gt) => gt.table)
    .sort();

  const mc = new Mapcache(getAdminClient().http);
  const db = database || '{database}';
  const tileset = schema && table ? `${schema}.${table}` : '{schema}.{table}';

  const wmtsCapabilities = mc.mapcacheUrl(db, 'wmts/1.0.0/WMTSCapabilities.xml');
  const rasterTemplate = mc.mapcacheUrl(db, `tms/1.0.0/${tileset}@${grid}/{z}/{x}/{y}.png`);
  const mvtTemplate = mc.mapcacheUrl(db, `tms/1.0.0/${tileset}.mvt@${grid}/{z}/{x}/{y}.mvt`);
  const xyzRasterTemplate = mc.mapcacheUrl(db, `gmaps/${tileset}@${grid}/{z}/{x}/{y}.png`);
  const xyzMvtTemplate = mc.mapcacheUrl(db, `gmaps/${tileset}.mvt@${grid}/{z}/{x}/{y}.mvt`);

  return (
    <div style={{ maxWidth: 860 }}>
      <h2>Tile Cache</h2>
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="Select schema"
          style={{ width: 220 }}
          loading={isLoading}
          showSearch
          value={schema}
          onChange={(v) => {
            setSchema(v);
            setTable(null);
          }}
          options={schemas.map((s) => ({ label: s, value: s }))}
        />
        <Select
          placeholder="Select table"
          style={{ width: 260 }}
          showSearch
          disabled={!schema}
          value={table}
          onChange={setTable}
          options={tables.map((t) => ({ label: t, value: t }))}
        />
        <Select
          style={{ width: 260 }}
          value={grid}
          onChange={setGrid}
          options={GRID_OPTIONS}
        />
      </Space>

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card title="WMTS" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <UrlField
              label="GetCapabilities (all tilesets in the database)"
              url={wmtsCapabilities}
              openUrl={wmtsCapabilities}
            />
            <Alert
              type="info"
              showIcon
              message={
                <>
                  The easiest way into QGIS: add the capabilities URL as a{' '}
                  <Text strong>WMS/WMTS</Text> connection and pick the tileset. Anonymously
                  readable layers need no credentials; protected tilesets are challenged with
                  HTTP Basic auth (the database&apos;s viewer password). Applications can send an{' '}
                  <Text code>Authorization: Bearer</Text> header instead — the token cannot be
                  put in the URL.
                </>
              }
            />
          </Space>
        </Card>

        <Card title="Tile URL templates (Google Maps XYZ)" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <UrlField label="Cached image tiles (PNG)" url={xyzRasterTemplate} />
            <UrlField label="Vector tiles (MVT)" url={xyzMvtTemplate} />
            <Alert
              type="info"
              showIcon
              message={
                <>
                  Standard <Text strong>XYZ</Text> axis order (top-left origin) — usable as-is
                  with <Text code>{'{y}'}</Text> in a QGIS XYZ connection, MapLibre, Leaflet or
                  OpenLayers. Prefer this over the TMS templates unless your client specifically
                  speaks TMS.
                </>
              }
            />
          </Space>
        </Card>

        <Card title="Tile URL templates (TMS)" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <UrlField label="Cached image tiles (PNG)" url={rasterTemplate} />
            <UrlField label="Vector tiles (MVT)" url={mvtTemplate} />
            <Alert
              type="info"
              showIcon
              message={
                <>
                  The templates are <Text strong>TMS</Text>, so the y-axis is flipped compared
                  to XYZ: in a QGIS XYZ connection write <Text code>{'{-y}'}</Text> instead of{' '}
                  <Text code>{'{y}'}</Text>; in MapLibre set <Text code>scheme: &apos;tms&apos;</Text>.
                  The MVT tiles&apos; source-layer is named <Text code>schema.table</Text>.
                </>
              }
            />
          </Space>
        </Card>
      </Space>
    </div>
  );
}
