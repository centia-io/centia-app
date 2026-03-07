import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Table, Button, Space, Drawer, Form, Input, Select, Spin, Alert, Tabs, message } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { confirmDelete } from '../../components/ConfirmDelete';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '../../data/queryClient';
import { rollback } from '../../data/optimistic';

// ──── Types ────

type SchemaDetailResponse = {
  name: string;
  tables?: Array<{ name: string; columns?: unknown[] }>;
};

// ──── Tables ────

function TablesPanel({ schema }: { schema: string }) {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [form] = Form.useForm();

  const queryKey = ['schema-detail', schema] as const;

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      return await getAdminClient().provisioning.schemas.getSchema(schema) as SchemaDetailResponse;
    },
    staleTime: 30_000,
  });

  const tables =
    data?.tables?.map((t) => ({
      name: t.name,
      columnCount: t.columns?.length ?? 0,
    })) ?? [];

  const handleCreate = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await getAdminClient().provisioning.tables.postTable(schema, { name: values.name });
      message.success(`Table "${values.name}" created`);
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['schemas'] });
      form.resetFields();
      setCreateOpen(false);
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (name: string) => {
    confirmDelete(name, async () => {
      const ctx = {
        queryKey,
        previous: queryClient.getQueryData(queryKey),
      };
      queryClient.setQueryData(queryKey, (old: SchemaDetailResponse | undefined) => {
        if (!old) return old;
        return { ...old, tables: (old.tables ?? []).filter((t) => t.name !== name) };
      });
      try {
        await getAdminClient().provisioning.tables.deleteTable(schema, name);
        message.success(`Table "${name}" deleted`);
        queryClient.invalidateQueries({ queryKey });
        queryClient.invalidateQueries({ queryKey: ['schemas'] });
      } catch (e: unknown) {
        rollback(ctx);
        message.error(getErrorMessage(e));
      }
    });
  };

  if (isLoading) return <Spin />;
  if (error) return <Alert type="error" message={String(error)} />;

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'flex-end', width: '100%' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>New Table</Button>
      </Space>
      <Input.Search placeholder="Search tables..." allowClear onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12, maxWidth: 300 }} />
      <Table
        dataSource={tables.filter((r) => !search || r.name.toLowerCase().includes(search.toLowerCase()))}
        rowKey="name"
        pagination={false}
        columns={[
          { title: 'Name', dataIndex: 'name', key: 'name',
            sorter: (a, b) => a.name.localeCompare(b.name),
            render: (name: string) => <a onClick={() => navigate(`/schemas/${schema}/tables/${name}`)}>{name}</a>,
          },
          { title: 'Columns', dataIndex: 'columnCount', key: 'columnCount',
            sorter: (a, b) => a.columnCount - b.columnCount,
          },
          { title: 'Actions', key: 'actions', width: 100,
            render: (_: unknown, record: any) => (
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.name)} />
            ),
          },
        ]}
      />
      <Drawer title="Create Table" open={createOpen} onClose={() => setCreateOpen(false)} width={400}
        extra={<Button type="primary" onClick={handleCreate} loading={saving}>Save</Button>}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Table Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}

// ──── Sequences ────

function SequencesPanel({ schema }: { schema: string }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [form] = Form.useForm();

  const { data, isLoading, error } = useQuery({
    queryKey: ['sequences', schema],
    queryFn: async () => {
      return await getAdminClient().provisioning.sequences.getSequence(schema);
    },
    staleTime: 30_000,
  });

  const sequences = data ?? [];

  const handleCreate = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await getAdminClient().provisioning.sequences.postSequence(schema, values);
      message.success('Sequence created');
      queryClient.invalidateQueries({ queryKey: ['sequences', schema] });
      form.resetFields();
      setCreateOpen(false);
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (name: string) => {
    confirmDelete(name, async () => {
      try {
        await getAdminClient().provisioning.sequences.deleteSequence(schema, name);
        message.success('Sequence deleted');
        queryClient.invalidateQueries({ queryKey: ['sequences', schema] });
      } catch (e: unknown) {
        message.error(getErrorMessage(e));
      }
    });
  };

  if (isLoading) return <Spin />;
  if (error) return <Alert type="error" message={String(error)} />;

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'flex-end', width: '100%' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>New Sequence</Button>
      </Space>
      <Input.Search placeholder="Search sequences..." allowClear onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12, maxWidth: 300 }} />
      <Table
        dataSource={(sequences as any[]).filter((r) => !search || (r.name ?? '').toLowerCase().includes(search.toLowerCase()))}
        rowKey="name"
        size="small"
        pagination={false}
        columns={[
          { title: 'Name', dataIndex: 'name', key: 'name',
            sorter: (a: any, b: any) => (a.name ?? '').localeCompare(b.name ?? ''),
          },
          { title: 'Data Type', dataIndex: 'data_type', key: 'data_type',
            sorter: (a: any, b: any) => (a.data_type ?? '').localeCompare(b.data_type ?? ''),
          },
          { title: 'Start', dataIndex: 'start_value', key: 'start' },
          { title: 'Increment', dataIndex: 'increment_by', key: 'increment' },
          { title: 'Actions', key: 'actions', width: 80,
            render: (_: unknown, record: any) => (
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.name)} />
            ),
          },
        ]}
      />
      <Drawer title="Create Sequence" open={createOpen} onClose={() => setCreateOpen(false)} width={400}
        extra={<Button type="primary" onClick={handleCreate} loading={saving}>Save</Button>}>
        <Form form={form} layout="vertical" initialValues={{ data_type: 'bigint', increment_by: 1 }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="data_type" label="Data Type">
            <Select options={[
              { label: 'smallint', value: 'smallint' },
              { label: 'integer', value: 'integer' },
              { label: 'bigint', value: 'bigint' },
            ]} />
          </Form.Item>
          <Form.Item name="start_value" label="Start Value">
            <Input type="number" />
          </Form.Item>
          <Form.Item name="increment_by" label="Increment By">
            <Input type="number" />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}

// ──── Page ────

export default function TableListPage() {
  const { s: schema } = useParams<{ s: string }>();

  return (
    <div>
      <h2>{schema}</h2>
      <Tabs
        defaultActiveKey="tables"
        items={[
          { key: 'tables', label: 'Tables', children: <TablesPanel schema={schema!} /> },
          { key: 'sequences', label: 'Sequences', children: <SequencesPanel schema={schema!} /> },
        ]}
      />
    </div>
  );
}
