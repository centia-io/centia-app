import { useState } from 'react';
import { Table, Button, Space, Drawer, Form, Input, Modal, Select, Switch, Spin, Alert, Tag, Typography } from 'antd';
import { message } from '../../utils/message';
import { PlusOutlined, DeleteOutlined, EditOutlined, CopyOutlined } from '@ant-design/icons';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { confirmDelete } from '../../components/ConfirmDelete';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '../../data/queryClient';
import { optimisticInsert, optimisticDelete, optimisticUpdate, rollback } from '../../data/optimistic';

// ──── Shared UI ────

function ClientForm({ form, isEdit }: { form: ReturnType<typeof Form.useForm>[0]; isEdit: boolean }) {
  return (
    <Form form={form} layout="vertical" initialValues={{ public: false, confirm: true, two_factor: true }}>
      <Form.Item
        name="id"
        label="Client ID"
        extra={isEdit ? undefined : 'Leave empty to auto-generate an id.'}
      >
        <Input disabled={isEdit} />
      </Form.Item>
      <Form.Item name="name" label="Name" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item name="homepage" label="Homepage URL">
        <Input />
      </Form.Item>
      <Form.Item
        name="redirect_uri"
        label="Redirect URIs"
        extra="Type a URI and press Enter (or comma) to add it."
      >
        <Select
          mode="tags"
          open={false}
          suffixIcon={null}
          tokenSeparators={[',', ' ']}
          placeholder="https://app.example.com/callback"
        />
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
    { title: 'ID', dataIndex: 'id', key: 'id',
      sorter: (a: any, b: any) => (a.id ?? '').localeCompare(b.id ?? ''),
    },
    { title: 'Name', dataIndex: 'name', key: 'name',
      sorter: (a: any, b: any) => (a.name ?? '').localeCompare(b.name ?? ''),
    },
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

/**
 * One-time display of a newly created client's secret. The API returns it
 * only on creation; once this dialog is closed it cannot be shown again.
 */
function SecretModal({ secret, onClose }: { secret: string | null; onClose: () => void }) {
  return (
    <Modal
      title="Client secret"
      open={secret !== null}
      onCancel={onClose}
      maskClosable={false}
      footer={
        <Button type="primary" onClick={onClose}>
          I have stored the secret
        </Button>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Alert
          type="warning"
          showIcon
          message="This secret is shown only once. Copy and store it now — it cannot be retrieved later."
        />
        <Space.Compact style={{ width: '100%' }}>
          <Input readOnly value={secret ?? ''} style={{ fontFamily: 'monospace' }} />
          <Button
            icon={<CopyOutlined />}
            onClick={async () => {
              await navigator.clipboard.writeText(secret ?? '');
              message.success('Secret copied');
            }}
          >
            Copy
          </Button>
        </Space.Compact>
        <Typography.Text type="secondary">
          Use it as the client_secret for this OAuth client.
        </Typography.Text>
      </Space>
    </Modal>
  );
}

function parseRedirectUris(values: any) {
  // The tags Select yields a string[]; tolerate a legacy comma-separated string.
  if (typeof values.redirect_uri === 'string') {
    values.redirect_uri = values.redirect_uri.split(',').map((s: string) => s.trim()).filter(Boolean);
  }
  // Wire contract: always an array; [] means "no redirect URIs" (clears on edit).
  values.redirect_uri = (values.redirect_uri ?? []).map((s: string) => s.trim()).filter(Boolean);
  return values;
}

// ──── Page ────

export default function ClientListPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [editClient, setEditClient] = useState<any>(null);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [form] = Form.useForm();

  const { data, isLoading, error } = useQuery({
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
    // An omitted id is auto-generated by the server; never send an empty string.
    if (!values.id) delete values.id;
    setSaving(true);
    try {
      if (isEdit) {
        await getAdminClient().provisioning.clients.patchClient(editClient.id, values);
      } else {
        const created = await getAdminClient().provisioning.clients.postClient(values);
        // The secret exists only in this response — surface it once, never store it.
        if (created?.secret) setCreatedSecret(created.secret);
      }
      message.success(isEdit ? 'Client updated' : 'Client created');
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      form.resetFields();
      setDrawerOpen(false);
      setEditClient(null);
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSaving(false);
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
      redirect_uri: record.redirect_uri ?? [],
    });
    setDrawerOpen(true);
  };

  if (isLoading) return <Spin />;
  if (error) return <Alert type="error" message={String(error)} />;

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <h2>OAuth Clients</h2>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditClient(null); form.resetFields(); setDrawerOpen(true); }}>
            New Client
          </Button>
        </Space>
      </Space>
      <Input.Search placeholder="Search clients..." allowClear onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12, maxWidth: 300 }} />
      <Table dataSource={(clients as any[]).filter((r) => !search || [r.id, r.name].some((v) => (v ?? '').toLowerCase().includes(search.toLowerCase())))} rowKey="id" size="small" pagination={false} columns={clientColumns(handleEdit, handleDelete)} />
      <Drawer title={editClient ? 'Edit Client' : 'Create Client'} open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditClient(null); }} width={520}
        extra={<Button type="primary" onClick={handleSave} loading={saving}>Save</Button>}>
        <ClientForm form={form} isEdit={!!editClient} />
      </Drawer>
      <SecretModal secret={createdSecret} onClose={() => setCreatedSecret(null)} />
    </div>
  );
}
