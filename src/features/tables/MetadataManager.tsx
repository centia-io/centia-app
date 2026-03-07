import { useState, useEffect } from 'react';
import { Button, Form, Spin, message } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { getMeta } from '../../baas/client';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import SchemaForm from '../../components/SchemaForm';
import { testPropertiesSchema } from '../../data/testPropertiesSchema';

interface Props {
  schema: string;
  table: string;
}

export default function MetadataManager({ schema, table }: Props) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const qualifiedName = `${schema}.${table}`;

  useEffect(() => {
    setLoading(true);
    getMeta().query(qualifiedName)
      .then((res: any) => {
        const meta = res?.relations?.[qualifiedName] ?? res?.[qualifiedName] ?? {};
        form.setFieldsValue(meta.properties ?? {});
      })
      .catch(() => {
        form.resetFields();
      })
      .finally(() => setLoading(false));
  }, [schema, table, qualifiedName, form]);

  const save = async () => {
    const values = form.getFieldsValue();
    const properties: Record<string, any> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v !== undefined && v !== null && v !== '') properties[k] = v;
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
      <SchemaForm schema={testPropertiesSchema} form={form} />
      <Button type="primary" icon={<SaveOutlined />} onClick={save} loading={saving} style={{ marginTop: 12 }}>
        Save Properties
      </Button>
    </div>
  );
}
