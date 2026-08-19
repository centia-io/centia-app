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

  const owsUrl = `${host}/api/v4/ows/schema/${s}/database/${db}`;
  const wfsUrl = `${host}/api/v4/wfs/schema/${s}/database/${db}${srsPath}`;

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
              label="Service URL (anonymous, HTTP Basic or Bearer token)"
              url={owsUrl}
              openUrl={`${owsUrl}?SERVICE=WMS&REQUEST=GetCapabilities`}
            />
            <Alert
              type="info"
              showIcon
              message={
                <>
                  Read-only endpoint serving WMS rendering and WFS reads. In QGIS, add the URL as
                  a <Text strong>WMS/WMTS</Text> connection. Anonymously readable layers need no
                  credentials; protected layers are challenged with HTTP Basic auth using the
                  database&apos;s viewer password. Applications can send an{' '}
                  <Text code>Authorization: Bearer</Text> header instead — the token must match
                  the database in the path.
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
              label="Service URL (anonymous, HTTP Basic or Bearer token)"
              url={wfsUrl}
              openUrl={`${wfsUrl}?SERVICE=WFS&REQUEST=GetCapabilities`}
            />
            <Alert
              type="info"
              showIcon
              message={
                <>
                  WFS endpoint with transaction support (WFS-T): writable layers accept inserts,
                  updates and deletes. In QGIS, add the URL as a{' '}
                  <Text strong>WFS / OGC API Features</Text> connection. Pick an SRS above to pin
                  coordinates to a specific EPSG code — without it the service default is used.
                  Transactions require credentials: HTTP Basic (viewer password) or an{' '}
                  <Text code>Authorization: Bearer</Text> header.
                </>
              }
            />
          </Space>
        </Card>
      </Space>
    </div>
  );
}
