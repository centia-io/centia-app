import { useState } from 'react';
import { Alert, Card, Select, Space, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Ogc } from '@centia-io/sdk';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import UrlField from './UrlField';

const { Text } = Typography;

const CRS84 = 'http://www.opengis.net/def/crs/OGC/1.3/CRS84';
const EPSG_4326 = 'http://www.opengis.net/def/crs/EPSG/0/4326';

/** OGC API Features (Part 1 + 2) and Maps (Part 1) under /api/v4/ogc. */
export default function OgcApiCard({
  host,
  database,
  schema,
}: {
  host: string;
  database: string;
  schema: string | null;
}) {
  const [collectionId, setCollectionId] = useState<string | null>(null);

  const db = database ? encodeURIComponent(database) : '{database}';
  const base = `${host}/api/v4/ogc/database/${db}`;

  const { data, error } = useQuery({
    queryKey: ['ogc-collections', database],
    queryFn: async () =>
      await new Ogc(getAdminClient().http).getCollections(database, { limit: 1000 }),
    enabled: !!database,
    staleTime: 30_000,
  });

  const collections = data?.collections ?? [];
  const visible = schema
    ? collections.filter((c) => c.id.startsWith(`${schema}.`))
    : collections;
  const selected = collections.find((c) => c.id === collectionId) ?? null;
  const isVector = selected?.itemType === 'feature';

  return (
    <Card title="OGC API (Features & Maps)" extra={<Text type="secondary">Read-only</Text>} size="small">
      <Space direction="vertical" style={{ width: '100%' }}>
        <UrlField label="Landing page" url={base} openUrl={base} />
        <UrlField label="Conformance" url={`${base}/conformance`} openUrl={`${base}/conformance`} />
        <UrlField label="Collections" url={`${base}/collections`} openUrl={`${base}/collections`} />

        {error ? (
          <Alert
            type="warning"
            showIcon
            message={`Could not list collections: ${getErrorMessage(error)}`}
          />
        ) : (
          <Select
            placeholder="Select collection (OWS-enabled layer)"
            style={{ width: 360 }}
            allowClear
            showSearch
            value={collectionId}
            onChange={(v) => setCollectionId(v ?? null)}
            options={visible.map((c) => ({
              label: c.title && c.title !== c.id ? `${c.id} — ${c.title}` : c.id,
              value: c.id,
            }))}
          />
        )}

        {selected && (
          <>
            <UrlField
              label="Collection"
              url={`${base}/collections/${encodeURIComponent(selected.id)}`}
              openUrl={`${base}/collections/${encodeURIComponent(selected.id)}`}
            />
            {isVector ? (
              <UrlField
                label="Items (GeoJSON — page size 10 by default; limit, offset, bbox, crs)"
                url={`${base}/collections/${encodeURIComponent(selected.id)}/items`}
                openUrl={`${base}/collections/${encodeURIComponent(selected.id)}/items`}
              />
            ) : (
              <Text type="secondary">Raster layer — no items endpoint, map only.</Text>
            )}
            <UrlField
              label="Map (PNG by default; f=jpeg, bbox, width, height)"
              url={`${base}/collections/${encodeURIComponent(selected.id)}/map`}
              openUrl={`${base}/collections/${encodeURIComponent(selected.id)}/map`}
            />
            {selected.crs && selected.crs.length > 0 && (
              <div>
                <Text type="secondary">CRS: </Text>
                <Space size={4} wrap>
                  {selected.crs.map((uri) => (
                    <Tag key={uri}>
                      {uri === CRS84
                        ? 'CRS84 (default, lon/lat)'
                        : uri === EPSG_4326
                          ? 'EPSG:4326 (lat/lon)'
                          : uri.replace('http://www.opengis.net/def/crs/EPSG/0/', 'EPSG:')}
                    </Tag>
                  ))}
                </Space>
              </div>
            )}
          </>
        )}

        <Alert
          type="info"
          showIcon
          message={
            <>
              Standards-based read-only access to OWS-enabled layers: features as GeoJSON
              (OGC API Features Part 1 + 2) and rendered map images (OGC API Maps Part 1).
              Pass <Text code>crs</Text>/<Text code>bbox-crs</Text> as full CRS URIs from the
              collection&apos;s list; versioned layers accept{' '}
              <Text code>datetime=&lt;ISO instant&gt;</Text>. Anonymously readable layers need
              no credentials; protected layers return 401 (anonymous) or 403 (no privilege) —
              send HTTP Basic or an <Text code>Authorization: Bearer</Text> header matching the
              database. API description:{' '}
              <a href={`${host}/swagger/api.php?v=4`} target="_blank" rel="noreferrer">
                OpenAPI
              </a>
              .
            </>
          }
        />
      </Space>
    </Card>
  );
}
