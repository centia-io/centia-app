import { useState } from 'react';
import { Table, Button, Space, Drawer, Form, Input, InputNumber, Select, Spin, Alert, Tag } from 'antd';
import { message } from '../../utils/message';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { confirmDelete } from '../../components/ConfirmDelete';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '../../data/queryClient';
import { optimisticInsert, optimisticDelete, optimisticUpdate, rollback } from '../../data/optimistic';

// ──── Shared UI ────

function RuleForm({ form }: { form: ReturnType<typeof Form.useForm>[0] }) {
  return (
    <Form form={form} layout="vertical" initialValues={{ access: 'allow', priority: 0 }}>
      <Form.Item name="access" label="Access" rules={[{ required: true }]}>
        <Select options={[
          { label: 'Allow', value: 'allow' },
          { label: 'Limit', value: 'limit' },
          { label: 'Deny', value: 'deny' },
        ]} />
      </Form.Item>
      <Form.Item name="priority" label="Priority">
        <InputNumber style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item name="service" label="Service">
        <Select allowClear options={[
          { label: 'SQL', value: 'sql' },
          { label: 'OWS', value: 'ows' },
          { label: 'WFS-T', value: 'wfst' },
        ]} />
      </Form.Item>
      <Form.Item name="request" label="Request">
        <Select allowClear options={[
          { label: 'SELECT', value: 'select' },
          { label: 'INSERT', value: 'insert' },
          { label: 'UPDATE', value: 'update' },
          { label: 'DELETE', value: 'delete' },
        ]} />
      </Form.Item>
      <Form.Item name="schema" label="Schema">
        <Input />
      </Form.Item>
      <Form.Item name="table" label="Table">
        <Input />
      </Form.Item>
      <Form.Item name="username" label="Username">
        <Input />
      </Form.Item>
      <Form.Item name="iprange" label="IP Range (CIDR)">
        <Input placeholder="e.g. 192.168.1.0/24" />
      </Form.Item>
      <Form.Item name="filter" label="Filter (for limit access)">
        <Input.TextArea rows={2} placeholder="SQL WHERE clause" />
      </Form.Item>
    </Form>
  );
}

function ruleColumns(onEdit: (r: any) => void, onDelete: (id: number) => void) {
  return [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60,
      sorter: (a: any, b: any) => (a.id ?? 0) - (b.id ?? 0),
    },
    { title: 'Priority', dataIndex: 'priority', key: 'priority', width: 80,
      sorter: (a: any, b: any) => (a.priority ?? 0) - (b.priority ?? 0),
    },
    { title: 'Access', dataIndex: 'access', key: 'access',
      sorter: (a: any, b: any) => (a.access ?? '').localeCompare(b.access ?? ''),
      render: (v: string) => (
        <Tag color={v === 'allow' ? 'green' : v === 'deny' ? 'red' : 'orange'}>{v}</Tag>
      ),
    },
    { title: 'Service', dataIndex: 'service', key: 'service',
      sorter: (a: any, b: any) => (a.service ?? '').localeCompare(b.service ?? ''),
    },
    { title: 'Request', dataIndex: 'request', key: 'request' },
    { title: 'Schema', dataIndex: 'schema', key: 'schema' },
    { title: 'Table', dataIndex: 'table', key: 'table' },
    { title: 'Username', dataIndex: 'username', key: 'username' },
    { title: 'Actions', key: 'actions', width: 120,
      render: (_: unknown, record: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(record)} />
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(record.id)} />
        </Space>
      ),
    },
  ];
}

// ──── Page ────

export default function RuleListPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [editRule, setEditRule] = useState<any>(null);
  const [form] = Form.useForm();

  const { data, isLoading, error } = useQuery({
    queryKey: ['rules'],
    queryFn: async () => {
      return await getAdminClient().provisioning.rules.getRule();
    },
    staleTime: 30_000,
  });

  const rules = data ?? [];

  const handleSave = async () => {
    const values = await form.validateFields();
    const isEdit = !!editRule;
    setSaving(true);
    try {
      if (isEdit) {
        await getAdminClient().provisioning.rules.patchRule(editRule.id, values);
      } else {
        await getAdminClient().provisioning.rules.postRule(values);
      }
      message.success(isEdit ? 'Rule updated' : 'Rule created');
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      form.resetFields();
      setDrawerOpen(false);
      setEditRule(null);
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: number) => {
    confirmDelete(`Rule #${id}`, async () => {
      const ctx = optimisticDelete(['rules'], 'id', id);
      try {
        await getAdminClient().provisioning.rules.deleteRule(id);
        message.success('Rule deleted');
        queryClient.invalidateQueries({ queryKey: ['rules'] });
      } catch (e: unknown) {
        rollback(ctx);
        message.error(getErrorMessage(e));
      }
    });
  };

  const handleEdit = (record: any) => {
    setEditRule(record);
    form.setFieldsValue(record);
    setDrawerOpen(true);
  };

  if (isLoading) return <Spin />;
  if (error) return <Alert type="error" message={String(error)} />;

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <h2>Access Rules</h2>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditRule(null); form.resetFields(); setDrawerOpen(true); }}>
            New Rule
          </Button>
        </Space>
      </Space>
      <Input.Search placeholder="Search rules..." allowClear onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12, maxWidth: 300 }} />
      <Table dataSource={(rules as any[]).filter((r) => !search || [r.access, r.service, r.schema, r.table, r.username].some((v) => (v ?? '').toLowerCase().includes(search.toLowerCase())))} rowKey="id" size="small" pagination={false} columns={ruleColumns(handleEdit, handleDelete)} />
      <Drawer title={editRule ? 'Edit Rule' : 'Create Rule'} open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditRule(null); }} width={520}
        extra={<Button type="primary" onClick={handleSave} loading={saving}>Save</Button>}>
        <RuleForm form={form} />
      </Drawer>
    </div>
  );
}
