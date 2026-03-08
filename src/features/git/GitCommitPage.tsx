import { useState } from 'react';
import { Form, Input, Select, Button, Card, Alert } from 'antd';
import { message } from '../../utils/message';
import { BranchesOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';

export default function GitCommitPage() {
  const { data: schemasData } = useQuery({
    queryKey: ['schemas'],
    queryFn: async () => await getAdminClient().provisioning.schemas.getSchema() as any[],
    staleTime: 30_000,
  });
  const schemas: string[] = (schemasData?.map((s: any) => s.name) ?? []).sort();

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm();

  const handleCommit = async () => {
    const values = await form.validateFields();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await getAdminClient().provisioning.gitCommit.postCommit(values);
      setResult(data);
      message.success('Commit successful');
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Git Commit</h2>
      <Card style={{ maxWidth: 600 }}>
        <Form form={form} layout="vertical">
          <Form.Item name="schema" label="Schema" rules={[{ required: true }]}>
            <Select options={schemas.map((s) => ({ label: s, value: s }))} placeholder="Select schema to export" />
          </Form.Item>
          <Form.Item name="repo" label="Repository URL" rules={[{ required: true }]}>
            <Input placeholder="https://github.com/user/repo.git" />
          </Form.Item>
          <Form.Item name="message" label="Commit Message" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="Describe the changes..." />
          </Form.Item>
          <Form.Item name="meta_query" label="Meta Query (optional)">
            <Input placeholder="Filter meta entries" />
          </Form.Item>
          <Button type="primary" icon={<BranchesOutlined />} onClick={handleCommit} loading={loading}>
            Commit & Push
          </Button>
        </Form>
      </Card>
      {error && <Alert type="error" message={error} style={{ marginTop: 16 }} />}
      {result && (
        <Card title="Result" style={{ marginTop: 16 }}>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </Card>
      )}
    </div>
  );
}
