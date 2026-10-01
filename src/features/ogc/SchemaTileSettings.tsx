import { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Divider, Form, Input, InputNumber, Popconfirm, Radio, Select, Space, Tag, Typography,
} from 'antd';
import { Mapcache } from '@centia-io/sdk';
import type { MapcacheTilesetDeleteResult } from '@centia-io/sdk';
import { useQuery } from '@tanstack/react-query';
import { message } from '../../utils/message';
import { getAdminClient, getApiErrorCode, getErrorMessage } from '../../baas/adminClient';

const { Text } = Typography;

/** Tiling settings of a schema's combined tilesets ("schema" and "schema.mvt"). */
interface SchemaTileSettingsValues {
  cache: 'sqlite' | 'disk' | 'memcache' | 's3';
  format: 'PNG' | 'jpeg_low' | 'jpeg_medium' | 'jpeg_high';
  ttl: number;
  auto_expire: number | null;
  meta_size: number;
  meta_buffer: number;
  s3_tile_set: string | null;
  title: string;
  abstract: string;
}

type Field = keyof SchemaTileSettingsValues;

interface SchemaTileSettingsResponse extends SchemaTileSettingsValues {
  schema: string;
  schema_exists: boolean;
  vector_format: string;
  /** Only what is actually stored; the rest above are defaults. */
  _stored: Partial<SchemaTileSettingsValues>;
  /** The defaults of the settable fields (absent on servers that predate it). */
  _defaults?: Partial<SchemaTileSettingsValues>;
}

const FIELDS: Field[] = ['cache', 'format', 'ttl', 'auto_expire', 'meta_size', 'meta_buffer', 's3_tile_set', 'title', 'abstract'];

// No SDK methods for /schemas/{schema}/tile yet; the SDK's authenticated client bridges the gap.
const path = (schema: string) => `api/v4/schemas/${encodeURIComponent(schema)}/tile`;
const http = () => getAdminClient().http;

const isEmpty = (v: unknown) => v === undefined || v === null || v === '';

/** Backends that cannot be wiped whole; only a scoped (zoom/bbox) delete reaches them. */
const SCOPED_ONLY = new Set(['s3', 'memcache']);

/** Clear the cached tiles of a schema's combined tilesets. */
function ClearSchemaCache({ database, schema, backend }: { database: string; schema: string; backend: string }) {
  const scopedOnly = SCOPED_ONLY.has(backend);
  const [scope, setScope] = useState<'all' | 'zoom'>(scopedOnly ? 'zoom' : 'all');
  const [zoom, setZoom] = useState<[number | null, number | null]>([0, 12]);
  const [clearing, setClearing] = useState(false);
  useEffect(() => setScope(scopedOnly ? 'zoom' : 'all'), [scopedOnly]);

  const zoomValid = zoom[0] !== null && zoom[1] !== null && zoom[0] <= zoom[1];

  const handleClear = async () => {
    const mc = new Mapcache(getAdminClient().http);
    const opts = scope === 'zoom' ? { zoom: `${zoom[0]},${zoom[1]}` } : {};
    setClearing(true);
    try {
      const results: MapcacheTilesetDeleteResult[] = await Promise.all([
        mc.deleteMapcacheTileset(database, schema, opts),
        mc.deleteMapcacheTileset(database, `${schema}.mvt`, opts),
      ]);
      const done = results.filter((r) => 'removed' in r);
      if (done.length < results.length) {
        message.success('Clearing the schema cache started; it runs in the background.');
      } else if (done.every((r) => r.backend === 'sqlite')) {
        const [img, vec] = done.map((r) => ('removed' in r ? r.removed : 0));
        message.success(`Schema cache cleared: ${(img + vec).toLocaleString()} tiles removed (${img.toLocaleString()} image, ${vec.toLocaleString()} vector)`);
      } else {
        message.success('Schema cache cleared');
      }
    } catch (e) {
      const code = getApiErrorCode(e);
      message.error(code ? `${code}: ${getErrorMessage(e)}` : getErrorMessage(e));
    } finally {
      setClearing(false);
    }
  };

  return (
    <>
      <Divider titlePlacement="start" orientationMargin={0}>Cached tiles</Divider>
      <Space direction="vertical">
        <Radio.Group value={scope} onChange={(e) => setScope(e.target.value)}>
          <Radio value="all" disabled={scopedOnly}>Entire tilesets</Radio>
          <Radio value="zoom">Zoom range</Radio>
        </Radio.Group>
        {scopedOnly && (
          <Text type="secondary">
            A {backend} cache can't be wiped whole; clear it by zoom range instead (runs in the background).
          </Text>
        )}
        {scope === 'zoom' && (
          <Space>
            <InputNumber min={0} max={30} value={zoom[0]} onChange={(v) => setZoom([v, zoom[1]])} addonBefore="From z" />
            <InputNumber min={0} max={30} value={zoom[1]} onChange={(v) => setZoom([zoom[0], v])} addonBefore="to z" />
          </Space>
        )}
        <Popconfirm
          title={`Delete the cached tiles of ${schema} and ${schema}.mvt${scope === 'zoom' ? ` at zoom ${zoom[0]}–${zoom[1]}` : ''}?`}
          okText="Clear"
          okButtonProps={{ danger: true }}
          onConfirm={handleClear}
          disabled={scope === 'zoom' && !zoomValid}
        >
          <Button danger loading={clearing} disabled={scope === 'zoom' && !zoomValid}>
            Clear cache
          </Button>
        </Popconfirm>
      </Space>
    </>
  );
}

export default function SchemaTileSettings({ database, schema }: { database: string; schema: string }) {
  const [form] = Form.useForm<Partial<SchemaTileSettingsValues>>();
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staleCacheWarning, setStaleCacheWarning] = useState(false);

  const { data, isLoading, error: loadError, refetch } = useQuery({
    queryKey: ['schema-tile-settings', schema],
    queryFn: async () => await http().request<SchemaTileSettingsResponse>({ path: path(schema), method: 'GET' }),
  });

  useEffect(() => {
    form.resetFields();
    if (data) form.setFieldsValue(data._stored);
    setError(null);
  }, [data, form]);
  useEffect(() => setStaleCacheWarning(false), [schema]);

  const cache = (Form.useWatch('cache', form) as string | undefined) ?? data?.cache;

  const handleSave = async () => {
    if (!data) return;
    const values = await form.validateFields();
    const patch: Record<string, unknown> = {};
    for (const f of FIELDS) {
      const next = isEmpty(values[f]) ? null : values[f];
      const prev = data._stored[f] ?? null;
      if (next !== prev) patch[f] = next; // null removes the setting, back to the default
    }
    if (Object.keys(patch).length === 0) {
      message.info('Nothing changed');
      return;
    }
    const before = { cache: data.cache, format: data.format };
    setSaving(true);
    setError(null);
    try {
      await http().requestFull({ path: path(schema), method: 'PATCH', body: patch, expectedStatus: 303 });
      // refetch, not fetchQuery: the app-wide staleTime would hand back the pre-save data.
      const after = (await refetch()).data;
      if (!after) return;
      setStaleCacheWarning(after.cache !== before.cache || after.format !== before.format);
      message.success('Tile settings saved');
    } catch (e) {
      const code = getApiErrorCode(e);
      setError(code ? `${code}: ${getErrorMessage(e)}` : getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    const before = data ? { cache: data.cache, format: data.format } : null;
    setResetting(true);
    setError(null);
    try {
      await http().request({ path: path(schema), method: 'DELETE', expectedStatus: 204 });
      // refetch, not fetchQuery: the app-wide staleTime would hand back the pre-save data.
      const after = (await refetch()).data;
      if (!after) return;
      setStaleCacheWarning(!!before && (after.cache !== before.cache || after.format !== before.format));
      message.success('Tile settings reset to defaults');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setResetting(false);
    }
  };

  const defaultOf = (f: Field): unknown => {
    if (!data) return undefined;
    if (data._defaults) return data._defaults[f];
    // Without _defaults the effective value equals the default only for unstored fields.
    return f in data._stored ? undefined : data[f];
  };
  const placeholder = (f: Field) => (isEmpty(defaultOf(f)) ? 'Default' : `Default: ${defaultOf(f)}`);
  const storedCount = data ? Object.keys(data._stored).length : 0;

  return (
    <Card
      size="small"
      style={{ marginBottom: 16 }}
      title={`Schema tileset settings: ${schema}`}
      extra={<Text type="secondary">Super-user only</Text>}
    >
      {loadError ? (
        <Alert type="error" showIcon message={getErrorMessage(loadError)} />
      ) : isLoading || !data ? (
        <Text type="secondary">Loading…</Text>
      ) : (
        <>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            Applies to the combined tilesets <Text code>{schema}</Text> and <Text code>{schema}.mvt</Text>, drawn
            from all layers of the schema. Each layer's own tileset is not affected. Empty fields use the default
            shown.
          </Text>
          {!data.schema_exists && (
            <Alert
              style={{ marginBottom: 12 }}
              type="info"
              showIcon
              message="These settings are waiting for their schema: they can be reset, but not saved until the schema exists again."
            />
          )}
          <Form form={form} layout="vertical" disabled={!data.schema_exists}>
            <Space wrap align="start" size="large">
              <Form.Item name="cache" label="Cache backend">
                <Select
                  allowClear
                  style={{ width: 180 }}
                  placeholder={placeholder('cache')}
                  options={['sqlite', 'disk', 'memcache', 's3'].map((v) => ({ label: v, value: v }))}
                />
              </Form.Item>
              <Form.Item name="format" label="Image format" tooltip="Format of the image tileset.">
                <Select
                  allowClear
                  style={{ width: 180 }}
                  placeholder={placeholder('format')}
                  options={['PNG', 'jpeg_low', 'jpeg_medium', 'jpeg_high'].map((v) => ({ label: v, value: v }))}
                />
              </Form.Item>
              <Form.Item label="Vector format" tooltip={`The ${schema}.mvt tileset is always MVT.`}>
                <Tag style={{ marginTop: 5 }}>{data.vector_format}</Tag>
              </Form.Item>
            </Space>
            <Space wrap align="start" size="large">
              <Form.Item name="ttl" label="TTL (seconds)" tooltip="At least 30.">
                <InputNumber min={30} style={{ width: 150 }} placeholder={placeholder('ttl')} />
              </Form.Item>
              <Form.Item name="auto_expire" label="Auto expire (seconds)">
                <InputNumber min={0} style={{ width: 150 }} placeholder={placeholder('auto_expire')} />
              </Form.Item>
              <Form.Item name="meta_size" label="Meta size" tooltip="Metatile size, 1–16.">
                <InputNumber min={1} max={16} style={{ width: 120 }} placeholder={placeholder('meta_size')} />
              </Form.Item>
              <Form.Item name="meta_buffer" label="Meta buffer" tooltip="Pixels, 0–512.">
                <InputNumber min={0} max={512} style={{ width: 120 }} placeholder={placeholder('meta_buffer')} />
              </Form.Item>
            </Space>
            {cache === 's3' && (
              <Form.Item
                name="s3_tile_set"
                label="S3 tile set"
                tooltip="One path name: letters, digits, _ - and ."
                rules={[{ pattern: /^(?!\.+$)[A-Za-z0-9_\-.]+$/, message: 'Letters, digits, _ - and . only, and not just dots' }]}
              >
                <Input style={{ width: 320 }} placeholder={placeholder('s3_tile_set')} />
              </Form.Item>
            )}
            <Form.Item name="title" label="Title" tooltip="Shown in the WMTS capabilities.">
              <Input style={{ maxWidth: 480 }} placeholder={placeholder('title')} />
            </Form.Item>
            <Form.Item name="abstract" label="Abstract" tooltip="Shown in the WMTS capabilities.">
              <Input.TextArea rows={2} style={{ maxWidth: 480 }} placeholder={placeholder('abstract')} />
            </Form.Item>
          </Form>
          {staleCacheWarning && (
            <Alert
              style={{ marginBottom: 12 }}
              type="warning"
              showIcon
              closable
              onClose={() => setStaleCacheWarning(false)}
              message="The cache backend or image format changed. Tiles cached before stay in the old backend or format, where they are neither served nor cleaned up."
            />
          )}
          {error && (
            <Alert style={{ marginBottom: 12 }} type="error" showIcon closable onClose={() => setError(null)} message={error} />
          )}
          <Space>
            <Button type="primary" loading={saving} disabled={!data.schema_exists} onClick={handleSave}>
              Save
            </Button>
            <Popconfirm
              title="Reset all tile settings for this schema to the defaults?"
              okText="Reset"
              onConfirm={handleReset}
              disabled={storedCount === 0}
            >
              <Button loading={resetting} disabled={storedCount === 0}>
                Reset to defaults
              </Button>
            </Popconfirm>
            <Text type="secondary">{storedCount === 0 ? 'All defaults' : `${storedCount} setting(s) stored`}</Text>
          </Space>
          {data.schema_exists && <ClearSchemaCache database={database} schema={schema} backend={data.cache} />}
        </>
      )}
    </Card>
  );
}
