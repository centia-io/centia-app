// src/features/realtime/SubscriptionForm.tsx
import { useState } from 'react';
import { Button, Input, Select, List, Space, Form, Tag } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { getAdminClient } from '../../baas/adminClient';
import type { SubscriptionRequest } from '@centia-io/sdk';

interface Props {
  subscriptions: SubscriptionRequest[];
  onSubscribe: (sub: SubscriptionRequest) => void;
  onRemove: (id: string) => void;
  disabled: boolean;
}

export default function SubscriptionForm({ subscriptions, onSubscribe, onRemove, disabled }: Props) {
  const [form] = Form.useForm();
  const [schema, setSchema] = useState<string | undefined>();

  const { data: schemas } = useQuery({
    queryKey: ['schemas'],
    queryFn: async () => {
      const res = await getAdminClient().provisioning.schemas.getSchema() as any[];
      return res.map((s: any) => s.name).sort() as string[];
    },
  });

  const { data: tables } = useQuery({
    queryKey: ['tables-for-sub', schema],
    queryFn: async () => {
      const detail = await getAdminClient().provisioning.schemas.getSchema(schema!) as any;
      return (detail?.tables ?? []).map((t: any) => t.name).sort() as string[];
    },
    enabled: !!schema,
  });

  const handleSubmit = (values: any) => {
    const sub: SubscriptionRequest = {
      id: values.id,
      schema: values.schema,
      rel: values.rel,
    };
    if (values.where) sub.where = values.where;
    if (values.columns) sub.columns = values.columns;
    if (values.op) sub.op = values.op;
    onSubscribe(sub);
    form.resetFields(['id', 'where', 'columns', 'op']);
  };

  return (
    <div>
      <Form form={form} layout="vertical" size="small" onFinish={handleSubmit}>
        <Form.Item name="id" label="ID" rules={[{ required: true, message: 'Required' }]}>
          <Input placeholder="my-subscription" disabled={disabled} />
        </Form.Item>
        <Form.Item name="schema" label="Schema" rules={[{ required: true }]}>
          <Select
            placeholder="Schema"
            options={schemas?.map((s) => ({ label: s, value: s }))}
            onChange={(v) => {
              setSchema(v);
              form.setFieldValue('rel', undefined);
            }}
            disabled={disabled}
          />
        </Form.Item>
        <Form.Item name="rel" label="Table" rules={[{ required: true }]}>
          <Select
            placeholder="Table"
            options={tables?.map((t) => ({ label: t, value: t }))}
            disabled={disabled || !schema}
          />
        </Form.Item>
        <Form.Item name="op" label="Operation">
          <Select
            placeholder="All"
            allowClear
            disabled={disabled}
            options={[
              { label: 'INSERT', value: 'INSERT' },
              { label: 'UPDATE', value: 'UPDATE' },
              { label: 'DELETE', value: 'DELETE' },
            ]}
          />
        </Form.Item>
        <Form.Item name="where" label="Where">
          <Input placeholder="status = 'active'" disabled={disabled} />
        </Form.Item>
        <Form.Item name="columns" label="Columns">
          <Input placeholder="id,name,email" disabled={disabled} />
        </Form.Item>
        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            icon={<PlusOutlined />}
            disabled={disabled}
            block
          >
            Subscribe
          </Button>
        </Form.Item>
      </Form>

      {subscriptions.length > 0 && (
        <List
          size="small"
          header={<strong style={{ fontSize: 12 }}>Active Subscriptions</strong>}
          dataSource={subscriptions}
          renderItem={(sub) => (
            <List.Item
              style={{ padding: '4px 0' }}
              actions={[
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  danger
                  onClick={() => onRemove(sub.id)}
                />,
              ]}
            >
              <Space size={4}>
                <Tag style={{ fontSize: 11 }}>{sub.id}</Tag>
                <span style={{ fontSize: 12 }}>
                  {sub.schema}.{sub.rel}
                </span>
                {sub.op && <Tag color="blue" style={{ fontSize: 10 }}>{sub.op}</Tag>}
              </Space>
            </List.Item>
          )}
        />
      )}
    </div>
  );
}
