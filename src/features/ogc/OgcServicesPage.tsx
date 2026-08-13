import { useState } from 'react';
import { Alert, Button, Card, Input, Select, Space, Tooltip, Typography } from 'antd';
import { CopyOutlined, ExportOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { getAdminClient } from '../../baas/adminClient';
import { useAuth } from '../../auth/AuthProvider';
import { message } from '../../utils/message';

const { Text } = Typography;

const SRS_OPTIONS = ['4326', '3857', '25832'];

function UrlField({ label, url, capabilitiesUrl }: {
  label: string;
  url: string;
  /** When set, a GetCapabilities link opens in the browser (no-token variants only). */
  capabilitiesUrl?: string;
}) {
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    message.success('URL copied');
  };
  return (
    <div>
      <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
      <Space.Compact style={{ width: '100%' }}>
        <Input readOnly value={url} onFocus={(e) => e.target.select()} />
        <Tooltip title="Copy URL">
          <Button icon={<CopyOutlined />} onClick={copy} />
        </Tooltip>
        {capabilitiesUrl && (
          <Tooltip title="Open GetCapabilities in browser">
            <Button icon={<ExportOutlined />} href={capabilitiesUrl} target="_blank" />
          </Tooltip>
        )}
      </Space.Compact>
    </div>
  );
}

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
        <Card title="OWS (WMS)" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <UrlField
              label="Anonymous / HTTP Basic (QGIS and other desktop GIS)"
              url={owsNoToken}
              capabilitiesUrl={`${owsNoToken}?SERVICE=WMS&REQUEST=GetCapabilities`}
            />
            <UrlField label="Token-authenticated (programmatic use)" url={owsToken} />
            <Alert
              type="info"
              showIcon
              message={
                <>
                  In QGIS, add the anonymous URL as a <Text strong>WMS/WMTS</Text> connection.
                  Anonymously readable layers need no credentials; protected layers are challenged
                  with HTTP Basic auth using the database&apos;s viewer password. The token variant
                  requires an <Text code>Authorization: Bearer</Text> header.
                </>
              }
            />
          </Space>
        </Card>

        <Card title="WFS" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <UrlField
              label="Anonymous / HTTP Basic (QGIS and other desktop GIS)"
              url={wfsNoToken}
              capabilitiesUrl={`${wfsNoToken}?SERVICE=WFS&REQUEST=GetCapabilities`}
            />
            <UrlField label="Token-authenticated (programmatic use)" url={wfsToken} />
            <Alert
              type="info"
              showIcon
              message={
                <>
                  In QGIS, add the anonymous URL as a <Text strong>WFS / OGC API Features</Text>{' '}
                  connection. Pick an SRS above to pin coordinates to a specific EPSG code —
                  without it the service default is used. WFS-T transactions on writable layers
                  require HTTP Basic auth (viewer password) or the token variant.
                </>
              }
            />
          </Space>
        </Card>
      </Space>
    </div>
  );
}
