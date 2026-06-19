import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Form, Input, InputNumber, Select, Button, Space, Spin } from 'antd';
import { message } from '../../utils/message';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import type { PatchRpcMethodRequest } from '@centia-io/sdk';
import { queryClient } from '../../data/queryClient';
import CodeEditor from '../../components/CodeEditor';

export default function RpcFormPage() {
  const { method } = useParams<{ method: string }>();
  const navigate = useNavigate();
  const isNew = method === 'new';
  const [form] = Form.useForm();
  const [sql, setSql] = useState('');
  const [typeHints, setTypeHints] = useState('{}');
  const [typeFormats, setTypeFormats] = useState('{}');
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (!isNew && method) {
      const admin = getAdminClient();
      admin.provisioning.rpcMethods.getRpc(method)
        .then((d: unknown) => {
          const m = (Array.isArray(d) ? d[0] : d) as { method: string; output_format?: string; q?: string; srs?: number; type_hints?: Record<string, string>; type_formats?: Record<string, string> };
          form.setFieldsValue({ method: m.method, output_format: m.output_format ?? 'json', srs: m.srs ?? 4326 });
          setSql(m.q ?? '');
          if (m.type_hints) setTypeHints(JSON.stringify(m.type_hints, null, 2));
          if (m.type_formats) setTypeFormats(JSON.stringify(m.type_formats, null, 2));
        })
        .finally(() => setLoading(false));
    }
  }, [method, isNew, form]);

  const handleSave = async () => {
    const values = await form.validateFields();
    const admin = getAdminClient();

    let parsedTypeHints: Record<string, string> | undefined;
    let parsedTypeFormats: Record<string, string> | undefined;
    try {
      const th = JSON.parse(typeHints);
      if (Object.keys(th).length > 0) parsedTypeHints = th;
    } catch {
      message.error('type_hints is not valid JSON');
      return;
    }
    try {
      const tf = JSON.parse(typeFormats);
      if (Object.keys(tf).length > 0) parsedTypeFormats = tf;
    } catch {
      message.error('type_formats is not valid JSON');
      return;
    }

    const payload: Record<string, unknown> = {
      q: sql,
      output_format: values.output_format,
      srs: values.srs,
      ...(parsedTypeHints && { type_hints: parsedTypeHints }),
      ...(parsedTypeFormats && { type_formats: parsedTypeFormats }),
    };

    try {
      if (isNew) {
        await admin.provisioning.rpcMethods.postRpc({ ...values, ...payload });
      } else {
        await admin.provisioning.rpcMethods.patchRpc(method!, payload as unknown as PatchRpcMethodRequest);
      }
      message.success(isNew ? 'Method created' : 'Method updated');
      queryClient.invalidateQueries({ queryKey: ['rpc-methods'] });
      navigate('/rpc');
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    }
  };

  if (loading) return <Spin />;

  return (
    <div>
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/rpc')} style={{ marginBottom: 8 }}>
        RPC Methods
      </Button>
      <h2>{isNew ? 'New RPC Method' : `Edit: ${method}`}</h2>
      <Form form={form} layout="vertical" style={{ maxWidth: 800 }}
        initialValues={{ output_format: 'json', srs: 4326 }}>
        <Form.Item name="method" label="Method Name" rules={[{ required: true }]}>
          <Input disabled={!isNew} />
        </Form.Item>
        <Form.Item label="SQL Query" required>
          <CodeEditor value={sql} onChange={setSql} language="sql" height="250px" />
        </Form.Item>
        <Space size="large" style={{ width: '100%' }}>
          <Form.Item name="output_format" label="Output Format">
            <Select style={{ width: 160 }} options={[
              { label: 'JSON', value: 'json' },
              { label: 'GeoJSON', value: 'geojson' },
              { label: 'CSV', value: 'csv' },
              { label: 'NDJson', value: 'ndjson' },
            ]} />
          </Form.Item>
          <Form.Item name="srs" label="SRS (EPSG)" tooltip="Spatial reference system EPSG code for geometry output">
            <InputNumber style={{ width: 160 }} min={0} />
          </Form.Item>
        </Space>
        <Form.Item label="Type Hints" tooltip="Type hints for parameters where server-side inference is ambiguous, e.g. {&quot;date&quot;: &quot;timestamptz&quot;, &quot;days&quot;: &quot;integer&quot;}">
          <CodeEditor value={typeHints} onChange={setTypeHints} language="json" height="100px" />
        </Form.Item>
        <Form.Item label="Type Formats" tooltip="Formatting rules for typed output columns, e.g. {&quot;date&quot;: &quot;D M d Y&quot;, &quot;time&quot;: &quot;H:i:s T&quot;}">
          <CodeEditor value={typeFormats} onChange={setTypeFormats} language="json" height="100px" />
        </Form.Item>
        <Space>
          <Button type="primary" onClick={handleSave}>Save</Button>
          <Button onClick={() => navigate('/rpc')}>Cancel</Button>
        </Space>
      </Form>
    </div>
  );
}
