import { useState } from 'react';
import { Alert, Card, Select, Space, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { getAdminClient } from '../../baas/adminClient';
import { useAuth } from '../../auth/AuthProvider';
import UrlField from './UrlField';

const { Text } = Typography;

const SRS_OPTIONS = ['4326', '3857', '25832'];

export default function OgcServicesPage() {
  const { user } = useAuth();
  const database = (user?.database as string) ?? '';
  const host = import.meta.env.VITE_CENTIA_HOST;

  const [schema, setSchema] = useState<string | null>(null);
  const [srs, setSrs] = useState<string | null>(null);

  const { data: schemas = [], isLoading } = useQuery({
    queryKey: ['schema-names'],
    queryFn: async () =>
      (await getAdminClient().provisioning.schemas.getSchema(undefined, { namesOnly: true })).map(
        (s) => s.name,
      ),
    staleTime: 30_000,
  });

  const s = schema ? encodeURIComponent(schema) : '{schema}';
  const db = database ? encodeURIComponent(database) : '{database}';
  const srsPath = srs ? `/srs/${encodeURIComponent(srs)}` : '';

  const owsToken = `${host}/api/v4/ows/schema/${s}`;
  const owsNoToken = `${host}/api/v4/ows/schema/${s}/database/${db}`;
  const wfsToken = `${host}/api/v4/wfs/schema/${s}${srsPath}`;
  const wfsNoToken = `${host}/api/v4/wfs/schema/${s}/database/${db}${srsPath}`;

  return (
    <div style={{ maxWidth: 860 }}>
      <h2>OGC Services</h2>
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="Select schema"
          style={{ width: 260 }}
          loading={isLoading}
          showSearch
          value={schema}
          onChange={setSchema}
          options={schemas.map((name) => ({ label: name, value: name }))}
        />
        <Select
          placeholder="SRS (optional, WFS)"
          style={{ width: 200 }}
          allowClear
          showSearch
          value={srs}
          onChange={(v) => setSrs(v ?? null)}
          options={SRS_OPTIONS.map((v) => ({ label: `EPSG:${v}`, value: v }))}
        />
      </Space>

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card
          title="OWS (WMS/WFS)"
          extra={<Text type="secondary">Read-only</Text>}
          size="small"
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <UrlField
              label="Anonymous / HTTP Basic (QGIS and other desktop GIS)"
              url={owsNoToken}
              openUrl={`${owsNoToken}?SERVICE=WMS&REQUEST=GetCapabilities`}
            />
            <UrlField label="Token-authenticated (programmatic use)" url={owsToken} />
            <Alert
              type="info"
              showIcon
              message={
                <>
                  Read-only endpoint serving WMS rendering and WFS reads. In QGIS, add the
                  anonymous URL as a <Text strong>WMS/WMTS</Text> connection. Anonymously readable
                  layers need no credentials; protected layers are challenged with HTTP Basic auth
                  using the database&apos;s viewer password. The token variant requires an{' '}
                  <Text code>Authorization: Bearer</Text> header.
                </>
              }
            />
          </Space>
        </Card>

        <Card
          title="WFS-t"
          extra={<Text type="secondary">Supports transactions</Text>}
          size="small"
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <UrlField
              label="Anonymous / HTTP Basic (QGIS and other desktop GIS)"
              url={wfsNoToken}
              openUrl={`${wfsNoToken}?SERVICE=WFS&REQUEST=GetCapabilities`}
            />
            <UrlField label="Token-authenticated (programmatic use)" url={wfsToken} />
            <Alert
              type="info"
              showIcon
              message={
                <>
                  WFS endpoint with transaction support (WFS-T): writable layers accept inserts,
                  updates and deletes. In QGIS, add the anonymous URL as a{' '}
                  <Text strong>WFS / OGC API Features</Text> connection. Pick an SRS above to pin
                  coordinates to a specific EPSG code — without it the service default is used.
                  Transactions require HTTP Basic auth (viewer password) or the token variant.
                </>
              }
            />
          </Space>
        </Card>
      </Space>
    </div>
  );
}
