import { useState } from 'react';
import { Table, Button, Space, Modal, Form, Input, Switch, Spin, Alert, message, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { confirmDelete } from '../../components/ConfirmDelete';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '../../data/queryClient';
import { optimisticInsert, optimisticDelete, optimisticUpdate, rollback } from '../../data/optimistic';

// ──── Shared UI ────

function ClientForm({ form, isEdit }: { form: ReturnType<typeof Form.useForm>[0]; isEdit: boolean }) {
  return (
    <Form form={form} layout="vertical" initialValues={{ public: false, confirm: true, two_factor: true }}>
      <Form.Item name="id" label="Client ID" rules={[{ required: true }]}>
        <Input disabled={isEdit} />
      </Form.Item>
      <Form.Item name="name" label="Name" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item name="homepage" label="Homepage URL">
        <Input />
      </Form.Item>
      <Form.Item name="redirect_uri" label="Redirect URIs (comma-separated)">
        <Input.TextArea rows={2} />
      </Form.Item>
      <Form.Item name="public" label="Public Client" valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.Item name="confirm" label="Require Confirmation" valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.Item name="two_factor" label="Two-Factor Auth" valuePropName="checked">
        <Switch />
      </Form.Item>
    </Form>
  );
}

function clientColumns(onEdit: (r: any) => void, onDelete: (id: string) => void) {
  return [
    { title: 'ID', dataIndex: 'id', key: 'id' },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Homepage', dataIndex: 'homepage', key: 'homepage' },
    { title: 'Public', dataIndex: 'public', key: 'public',
      render: (v: boolean) => v ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>,
    },
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

function parseRedirectUris(values: any) {
  if (typeof values.redirect_uri === 'string') {
    values.redirect_uri = values.redirect_uri.split(',').map((s: string) => s.trim()).filter(Boolean);
  }
  return values;
}

// ──── Page ────

export default function ClientListPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editClient, setEditClient] = useState<any>(null);
  const [form] = Form.useForm();

  const { data, isLoading, error, isFetching, isStale } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      return await getAdminClient().provisioning.clients.getClient();
    },
    staleTime: 30_000,
  });

  const clients = data ?? [];

  const handleSave = async () => {
    const values = parseRedirectUris(await form.validateFields());
    const isEdit = !!editClient;
    const ctx = isEdit
      ? optimisticUpdate(['clients'], 'id', editClient.id, values)
      : optimisticInsert(['clients'], { ...values });
    form.resetFields();
    setModalOpen(false);
    setEditClient(null);
    try {
      if (isEdit) {
        await getAdminClient().provisioning.clients.patchClient(editClient.id, values);
      } else {
        await getAdminClient().provisioning.clients.postClient(values);
      }
      message.success(isEdit ? 'Client updated' : 'Client created');
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    } catch (e: unknown) {
      rollback(ctx);
      message.error(getErrorMessage(e));
    }
  };

  const handleDelete = (id: string) => {
    confirmDelete(id, async () => {
      const ctx = optimisticDelete(['clients'], 'id', id);
      try {
        await getAdminClient().provisioning.clients.deleteClient(id);
        message.success('Client deleted');
        queryClient.invalidateQueries({ queryKey: ['clients'] });
      } catch (e: unknown) {
        rollback(ctx);
        message.error(getErrorMessage(e));
      }
    });
  };

  const handleEdit = (record: any) => {
    setEditClient(record);
    form.setFieldsValue({
      ...record,
      redirect_uri: record.redirect_uri?.join(', ') ?? '',
    });
    setModalOpen(true);
  };

  if (isLoading) return <Spin />;
  if (error) return <Alert type="error" message={String(error)} />;

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <h2>OAuth Clients</h2>
        <Space>
          <Tag color={isStale ? 'orange' : 'green'}>{isStale ? 'stale' : 'fresh'}</Tag>
          {isFetching && <Tag color="blue">refetching...</Tag>}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditClient(null); form.resetFields(); setModalOpen(true); }}>
            New Client
          </Button>
        </Space>
      </Space>
      <Table dataSource={clients} rowKey="id" size="small" columns={clientColumns(handleEdit, handleDelete)} />
      <Modal title={editClient ? 'Edit Client' : 'Create Client'} open={modalOpen}
        onOk={handleSave} onCancel={() => { setModalOpen(false); setEditClient(null); }} width={600}>
        <ClientForm form={form} isEdit={!!editClient} />
      </Modal>
    </div>
  );
}
