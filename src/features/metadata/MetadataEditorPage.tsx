import { useState } from 'react';
import { Button, Input, Space, Alert, message, Card, Form } from 'antd';
import { SearchOutlined, SaveOutlined } from '@ant-design/icons';
import { getMeta } from '../../baas/client';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import CodeEditor from '../../components/CodeEditor';

export default function MetadataEditorPage() {
  const [query, setQuery] = useState('');
  const [metadata, setMetadata] = useState<any>(null);
  const [editJson, setEditJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getMeta().query(query);
      setMetadata(res);
      setEditJson(JSON.stringify(res, null, 2));
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    try {
      const parsed = JSON.parse(editJson);
      await getAdminClient().provisioning.metadata.patchMetaData({ relations: parsed })
        .catch((e: any) => {
          if (e?.status === 204) return;
          throw e;
        });
      message.success('Metadata updated');
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    }
  };

  return (
    <div>
      <h2>Metadata Editor</h2>
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="schema.table or schema or tag:name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onPressEnter={search}
          style={{ width: 400 }}
        />
        <Button icon={<SearchOutlined />} onClick={search} loading={loading}>Search</Button>
      </Space>
      {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} />}
      {metadata && (
        <Card
          title="Metadata"
          extra={<Button type="primary" icon={<SaveOutlined />} onClick={save}>Save</Button>}
        >
          <CodeEditor value={editJson} onChange={setEditJson} language="json" height="500px" />
        </Card>
      )}
    </div>
  );
}
