import { useState } from 'react';
import { Drawer, Button, Space, Segmented, Alert, Typography } from 'antd';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import CodeEditor from '../../components/CodeEditor';

interface Props {
  name: string | null;
  onClose: () => void;
}

type Mode = 'Sync' | 'Async' | 'Dry-run';

export default function FunctionInvokeDrawer({ name, onClose }: Props) {
  const [event, setEvent] = useState('{}');
  const [mode, setMode] = useState<Mode>('Sync');
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!name) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const payload = JSON.parse(event || '{}');
      const fns = getAdminClient().provisioning.functions;
      const res =
        mode === 'Async' ? await fns.invokeAsync(name, payload)
        : mode === 'Dry-run' ? await fns.dryRun(name, payload)
        : await fns.invoke(name, payload);
      setResult(res);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    if (!name || !result || typeof result !== 'object') return;
    const id = (result as { invocation?: string }).invocation;
    if (!id) return;
    setLoading(true);
    try {
      setResult(await getAdminClient().provisioning.functions.getInvocation(name, id));
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer title={`Invoke: ${name}`} open={!!name} onClose={onClose} width={600}>
      <Typography.Text strong>Event (JSON)</Typography.Text>
      <div style={{ marginTop: 4 }}>
        <CodeEditor value={event} onChange={setEvent} language="json" height="140px" />
      </div>
      <Space style={{ marginTop: 12, marginBottom: 12 }}>
        <Segmented options={['Sync', 'Async', 'Dry-run']} value={mode} onChange={(v) => setMode(v as Mode)} />
        <Button type="primary" onClick={run} loading={loading}>Execute</Button>
        {mode === 'Async' && !!result && <Button onClick={refresh} loading={loading}>Refresh status</Button>}
      </Space>
      {mode === 'Dry-run' && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message="A dry-run executes the function to infer input/output types. Side effects are not rolled back." />
      )}
      {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} />}
      {result != null && (
        <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, maxHeight: 360, overflow: 'auto' }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </Drawer>
  );
}
