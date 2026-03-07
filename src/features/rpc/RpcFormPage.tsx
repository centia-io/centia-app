import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Form, Input, Select, Button, Space, Spin, message } from 'antd';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { queryClient } from '../../data/queryClient';
import CodeEditor from '../../components/CodeEditor';

export default function RpcFormPage() {
  const { method } = useParams<{ method: string }>();
  const navigate = useNavigate();
  const isNew = method === 'new';
  const [form] = Form.useForm();
  const [sql, setSql] = useState('');
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (!isNew && method) {
      const admin = getAdminClient();
      admin.provisioning.rpcMethods.getRpc(method)
        .then((d: unknown) => {
          const m = (Array.isArray(d) ? d[0] : d) as { method: string; output_format?: string; q?: string };
          form.setFieldsValue({ method: m.method, output_format: m.output_format ?? 'json' });
          setSql(m.q ?? '');
        })
        .finally(() => setLoading(false));
    }
  }, [method, isNew, form]);

  const handleSave = async () => {
    const values = await form.validateFields();
    const admin = getAdminClient();

    try {
      if (isNew) {
        await admin.provisioning.rpcMethods.postRpc({ ...values, q: sql });
      } else {
        await admin.provisioning.rpcMethods.patchRpc(method!, { q: sql, output_format: values.output_format });
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
      <h2>{isNew ? 'New RPC Method' : `Edit: ${method}`}</h2>
      <Form form={form} layout="vertical" style={{ maxWidth: 800 }}
        initialValues={{ output_format: 'json' }}>
        <Form.Item name="method" label="Method Name" rules={[{ required: true }]}>
          <Input disabled={!isNew} />
        </Form.Item>
        <Form.Item label="SQL Query" required>
          <CodeEditor value={sql} onChange={setSql} language="sql" height="250px" />
        </Form.Item>
        <Form.Item name="output_format" label="Output Format">
          <Select options={[
            { label: 'JSON', value: 'json' },
            { label: 'GeoJSON', value: 'geojson' },
            { label: 'CSV', value: 'csv' },
            { label: 'NDJson', value: 'ndjson' },
          ]} />
        </Form.Item>
        <Space>
          <Button type="primary" onClick={handleSave}>Save</Button>
          <Button onClick={() => navigate('/rpc')}>Cancel</Button>
        </Space>
      </Form>
    </div>
  );
}
