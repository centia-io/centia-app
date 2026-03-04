import { useState } from 'react';
import { Drawer, Button, Space, Switch, Typography, Alert } from 'antd';
import { getRpc } from '../../baas/client';
import CodeEditor from '../../components/CodeEditor';
import ResultTable from '../../components/ResultTable';

interface Props {
  method: string | null;
  onClose: () => void;
}

export default function RpcCallDrawer({ method, onClose }: Props) {
  const [params, setParams] = useState('{}');
  const [dryRun, setDryRun] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCall = async () => {
    if (!method) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const parsedParams = JSON.parse(params);
      const res = await getRpc().call({
        jsonrpc: '2.0',
        method: dryRun ? `${method}` : method,
        params: parsedParams,
        id: 1,
      });
      setResult(res);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer title={`Call: ${method}`} open={!!method} onClose={onClose} width={600}>
      <Typography.Text strong>Parameters (JSON)</Typography.Text>
      <CodeEditor value={params} onChange={setParams} language="json" height="120px" />
      <Space style={{ marginTop: 12, marginBottom: 12 }}>
        <Button type="primary" onClick={handleCall} loading={loading}>Execute</Button>
        <Space>
          <Switch checked={dryRun} onChange={setDryRun} size="small" />
          <Typography.Text>Dry Run</Typography.Text>
        </Space>
      </Space>
      {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} />}
      {result?.result?.data && <ResultTable data={result.result.data} />}
      {result && !result.result?.data && (
        <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, maxHeight: 300, overflow: 'auto' }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </Drawer>
  );
}
