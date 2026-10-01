import { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Input, InputNumber, Popconfirm, Select, Space, Tag, Typography } from 'antd';
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
}

const FIELDS: Field[] = ['cache', 'format', 'ttl', 'auto_expire', 'meta_size', 'meta_buffer', 's3_tile_set', 'title', 'abstract'];

// No SDK methods for /schemas/{schema}/tile yet; the SDK's authenticated client bridges the gap.
const path = (schema: string) => `api/v4/schemas/${encodeURIComponent(schema)}/tile`;
const http = () => getAdminClient().http;

const isEmpty = (v: unknown) => v === undefined || v === null || v === '';

export default function SchemaTileSettings({ schema }: { schema: string }) {
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

  // The effective value equals the default only for fields that are not stored.
  const placeholder = (f: Field) =>
    data && !(f in data._stored) && !isEmpty(data[f]) ? `Default: ${data[f]}` : 'Default';
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
        </>
      )}
    </Card>
  );
}
