import { useState } from 'react';
import { Button, Select, Space, Spin, Alert, Typography } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { getGql } from '../../baas/client';
import { getAdminClient } from '../../baas/adminClient';
import { useQuery } from '@tanstack/react-query';
import CodeEditor from '../../components/CodeEditor';
import ResultTable from '../../components/ResultTable';

export default function GraphqlExplorerPage() {
  const { data: schemasData } = useQuery({
    queryKey: ['schemas'],
    queryFn: async () => await getAdminClient().provisioning.schemas.getSchema() as any[],
    staleTime: 30_000,
  });
  const schemas: string[] = (schemasData?.map((s: any) => s.name) ?? []).sort();

  const [schema, setSchema] = useState('');
  const [query, setQuery] = useState('{\n  \n}');
  const [variables, setVariables] = useState('{}');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!schema) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const vars = JSON.parse(variables);
      const res = await getGql(schema).request({ query, variables: vars });
      if (res.errors?.length) {
        setError(res.errors.map((e: { message: string }) => e.message).join('\n'));
      }
      setResult(res.data);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const resultData = result ? Object.values(result).flat() : null;

  return (
    <div>
      <h2>GraphQL Explorer</h2>
      <Space style={{ marginBottom: 12 }}>
        <Select
          placeholder="Select schema"
          value={schema || undefined}
          onChange={setSchema}
          options={schemas.map((s) => ({ label: s, value: s }))}
          style={{ width: 200 }}
        />
      </Space>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <Typography.Text strong>Query</Typography.Text>
          <CodeEditor value={query} onChange={setQuery} language="graphql" height="300px" onRun={run} />
        </div>
        <div>
          <Typography.Text strong>Variables</Typography.Text>
          <CodeEditor value={variables} onChange={setVariables} language="json" height="300px" />
        </div>
      </div>
      <Space style={{ marginTop: 12, marginBottom: 12 }}>
        <Button type="primary" icon={<PlayCircleOutlined />} onClick={run} loading={loading} disabled={!schema}>
          Run (Ctrl+Enter)
        </Button>
      </Space>
      {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} />}
      {loading && <Spin />}
      {result && (
        Array.isArray(resultData) && resultData.length > 0 && typeof resultData[0] === 'object'
          ? <ResultTable data={resultData as Record<string, unknown>[]} />
          : <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 16, borderRadius: 6, maxHeight: 500, overflow: 'auto' }}>
              {JSON.stringify(result, null, 2)}
            </pre>
      )}
    </div>
  );
}
