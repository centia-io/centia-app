import { useState } from 'react';
import { Table, Button, Space, Input, Drawer, Form, Spin, Alert, message } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { confirmDelete } from '../../components/ConfirmDelete';
import { schemaCollection, type SchemaItem } from '../../data/collections/schemas';
import { useLiveQuery } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '../../data/queryClient';

export default function SchemaListPage() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState('');
  const [form] = Form.useForm();
  const [renameForm] = Form.useForm();

  const result = useLiveQuery((q) =>
    q.from({ s: schemaCollection }),
  );

  // Subscribe to the backing query to get loading state
  const { isLoading } = useQuery({
    queryKey: ['schemas'] as const,
    queryFn: async (): Promise<SchemaItem[]> => {
      return await getAdminClient().provisioning.schemas.getSchema() as SchemaItem[];
    },
    staleTime: 30_000,
  });

  const schemas: SchemaItem[] = (result?.data as SchemaItem[] | undefined) ?? [];

  const tableData = schemas.map((s) => ({
    name: s.name,
    tableCount: s.tables?.length ?? 0,
  }));

  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const handleCreate = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      schemaCollection.insert({ name: values.name, tables: [] });
      message.success(`Schema "${values.name}" created`);
      form.resetFields();
      setCreateOpen(false);
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleRename = async () => {
    const values = await renameForm.validateFields();
    setSaving(true);
    try {
      await getAdminClient().provisioning.schemas.patchSchema(renameTarget, { name: values.name });
      message.success(`Schema renamed to "${values.name}"`);
      renameForm.resetFields();
      setRenameOpen(false);
      queryClient.invalidateQueries({ queryKey: ['schemas'] });
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (name: string) => {
    confirmDelete(name, async () => {
      try {
        schemaCollection.delete(name);
        message.success(`Schema "${name}" deleted`);
      } catch (e: unknown) {
        message.error(getErrorMessage(e));
      }
    });
  };

  if (isLoading) return <Spin />;

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <h2>Schemas</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          New Schema
        </Button>
      </Space>
      <Input.Search placeholder="Search schemas..." allowClear onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12, maxWidth: 300 }} />
      <Table
        dataSource={tableData.filter((r) => !search || r.name.toLowerCase().includes(search.toLowerCase()))}
        rowKey="name"
        pagination={false}
        columns={[
          { title: 'Name', dataIndex: 'name', key: 'name',
            sorter: (a, b) => a.name.localeCompare(b.name),
            render: (name: string) => <a onClick={() => navigate(`/schemas/${name}`)}>{name}</a>,
          },
          { title: 'Tables', dataIndex: 'tableCount', key: 'tableCount',
            sorter: (a, b) => a.tableCount - b.tableCount,
          },
          { title: 'Actions', key: 'actions', width: 150,
            render: (_: unknown, record: any) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => {
                  setRenameTarget(record.name);
                  renameForm.setFieldsValue({ name: record.name });
                  setRenameOpen(true);
                }} />
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.name)} />
              </Space>
            ),
          },
        ]}
      />
      <Drawer title="Create Schema" open={createOpen} onClose={() => setCreateOpen(false)} width={400}
        extra={<Button type="primary" onClick={handleCreate} loading={saving}>Save</Button>}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Schema Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Form>
      </Drawer>
      <Drawer title="Rename Schema" open={renameOpen} onClose={() => setRenameOpen(false)} width={400}
        extra={<Button type="primary" onClick={handleRename} loading={saving}>Save</Button>}>
        <Form form={renameForm} layout="vertical">
          <Form.Item name="name" label="New Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
