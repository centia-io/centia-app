import { useState } from 'react';
import { Button, Select, Space, Spin, Alert, Typography } from 'antd';
import { message } from '../../utils/message';
import { PlayCircleOutlined } from '@ant-design/icons';
import { getSql } from '../../baas/client';
import CodeEditor from '../../components/CodeEditor';
import ResultTable from '../../components/ResultTable';

export default function SqlConsolePage() {
  const [query, setQuery] = useState('SELECT 1 AS test;');
  const [format, setFormat] = useState('json');
  const [result, setResult] = useState<any>(null);
  const [rawResult, setRawResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setRawResult(null);
    try {
      const res = await getSql().exec({ q: query });
      setResult(res);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>SQL Console</h2>
      <CodeEditor value={query} onChange={setQuery} language="sql" height="200px" onRun={run} />
      <Space style={{ marginTop: 12, marginBottom: 12 }}>
        <Button type="primary" icon={<PlayCircleOutlined />} onClick={run} loading={loading}>
          Run (Ctrl+Enter)
        </Button>
        <Select value={format} onChange={setFormat} style={{ width: 120 }}
          options={[
            { label: 'JSON', value: 'json' },
            { label: 'CSV', value: 'csv' },
            { label: 'GeoJSON', value: 'geojson' },
          ]}
        />
      </Space>
      {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} />}
      {loading && <Spin />}
      {result && (
        <div>
          <Typography.Text type="secondary">{result.data?.length ?? 0} rows returned</Typography.Text>
          <ResultTable data={result.data} schema={result.schema} />
        </div>
      )}
      {rawResult && (
        <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, maxHeight: 400, overflow: 'auto' }}>
          {rawResult}
        </pre>
      )}
    </div>
  );
}
