import { useState, useEffect } from 'react';
import { Form, Input, InputNumber, Button, Spin, message, Select } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { getMeta } from '../../baas/client';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import CodeEditor from '../../components/CodeEditor';

interface Props {
  schema: string;
  table: string;
}

export default function MetadataManager({ schema, table }: Props) {
  const [form] = Form.useForm();
  const [propsJson, setPropsJson] = useState('{}');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const qualifiedName = `${schema}.${table}`;

  useEffect(() => {
    setLoading(true);
    getMeta().query(qualifiedName)
      .then((res: any) => {
        const meta = res?.relations?.[qualifiedName] ?? res?.[qualifiedName] ?? {};
        form.setFieldsValue({
          title: meta.title ?? '',
          abstract: meta.abstract ?? '',
          group: meta.group ?? '',
          sort_id: meta.sort_id ?? null,
          tags: meta.tags ?? [],
        });
        setPropsJson(JSON.stringify(meta.properties ?? {}, null, 2));
      })
      .catch(() => {
        // No metadata yet — start with empty defaults
        form.resetFields();
        setPropsJson('{}');
      })
      .finally(() => setLoading(false));
  }, [schema, table, qualifiedName, form]);

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
      const values = form.getFieldsValue();
      const payload: Record<string, any> = {};
      if (Object.keys(properties).length) payload.properties = properties;
      if (values.title) payload.title = values.title;
      if (values.abstract) payload.abstract = values.abstract;
      if (values.group) payload.group = values.group;
      if (values.sort_id != null) payload.sort_id = values.sort_id;
      if (values.tags?.length) payload.tags = values.tags;

      await getAdminClient().provisioning.metadata.patchMetaData({
        relations: { [qualifiedName]: payload },
      }).catch((e: any) => {
        // SDK may reject on 204 No Content — that is a success
        if (e?.status === 204) return;
        throw e;
      });
      message.success('Metadata updated');
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spin />;

  return (
    <Form form={form} layout="vertical" style={{ maxWidth: 720 }}>
      <Form.Item label="Title" name="title">
        <Input placeholder="Human-readable title" />
      </Form.Item>
      <Form.Item label="Abstract" name="abstract">
        <Input.TextArea rows={2} placeholder="Description or summary" />
      </Form.Item>
      <Form.Item label="Group" name="group">
        <Input placeholder="Logical grouping" />
      </Form.Item>
      <Form.Item label="Sort ID" name="sort_id">
        <InputNumber style={{ width: '100%' }} placeholder="Sorting weight" />
      </Form.Item>
      <Form.Item label="Tags" name="tags">
        <Select mode="tags" placeholder="Add tags" />
      </Form.Item>
      <Form.Item label="Properties">
        <CodeEditor value={propsJson} onChange={setPropsJson} language="json" height="240px" />
      </Form.Item>
      <Form.Item>
        <Button type="primary" icon={<SaveOutlined />} onClick={save} loading={saving}>
          Save Metadata
        </Button>
      </Form.Item>
    </Form>
  );
}
