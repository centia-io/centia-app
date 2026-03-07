import { useState, useEffect } from 'react';
import { Button, Spin, message } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { getMeta } from '../../baas/client';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import CodeEditor from '../../components/CodeEditor';

interface Props {
  schema: string;
  table: string;
}

export default function MetadataManager({ schema, table }: Props) {
  const [propsJson, setPropsJson] = useState('{}');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const qualifiedName = `${schema}.${table}`;

  useEffect(() => {
    setLoading(true);
    getMeta().query(qualifiedName)
      .then((res: any) => {
        const meta = res?.relations?.[qualifiedName] ?? res?.[qualifiedName] ?? {};
        setPropsJson(JSON.stringify(meta.properties ?? {}, null, 2));
      })
      .catch(() => {
        setPropsJson('{}');
      })
      .finally(() => setLoading(false));
  }, [schema, table, qualifiedName]);

  const save = async () => {
    let properties: object;
    try {
      properties = JSON.parse(propsJson);
    } catch {
      message.error('Invalid JSON in properties');
      return;
    }

    setSaving(true);
    try {
      await getAdminClient().provisioning.metadata.patchMetaData({
        relations: {
          [qualifiedName]: {
            properties: Object.keys(properties).length ? properties : null,
          },
        },
      }).catch((e: any) => {
        if (e?.status === 204) return;
        throw e;
      });
      message.success('Properties updated');
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spin />;

  return (
    <div style={{ maxWidth: 720 }}>
      <p>Properties (JSON)</p>
      <CodeEditor value={propsJson} onChange={setPropsJson} language="json" height="300px" />
      <Button type="primary" icon={<SaveOutlined />} onClick={save} loading={saving} style={{ marginTop: 12 }}>
        Save Properties
      </Button>
    </div>
  );
}
