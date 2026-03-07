import { useState } from 'react';
import { Table, Button, Space, Drawer, Form, Input, Spin, Alert, message } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { confirmDelete } from '../../components/ConfirmDelete';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '../../data/queryClient';
import { optimisticInsert, optimisticDelete, optimisticUpdate, rollback } from '../../data/optimistic';

export default function UserListPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [editUser, setEditUser] = useState<any>(null);
  const [form] = Form.useForm();

  const { data, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      return await getAdminClient().provisioning.users.getUser();
    },
    staleTime: 30_000,
  });

  const users = data ?? [];

  const handleSave = async () => {
    const values = await form.validateFields();
    const isEdit = !!editUser;
    setSaving(true);
    try {
      if (isEdit) {
        await getAdminClient().provisioning.users.patchUser(editUser.name, values);
      } else {
        await getAdminClient().provisioning.users.postUser(values);
      }
      message.success(isEdit ? 'User updated' : 'User created');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      form.resetFields();
      setDrawerOpen(false);
      setEditUser(null);
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (name: string) => {
    confirmDelete(name, async () => {
      const ctx = optimisticDelete(['users'], 'name', name);
      try {
        await getAdminClient().provisioning.users.deleteUser(name);
        message.success('User deleted');
        queryClient.invalidateQueries({ queryKey: ['users'] });
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
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <h2>Sub-Users</h2>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditUser(null); form.resetFields(); setDrawerOpen(true); }}>
            New User
          </Button>
        </Space>
      </Space>
      <Input.Search placeholder="Search users..." allowClear onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12, maxWidth: 300 }} />
      <Table
        dataSource={(users as any[]).filter((r) => !search || [r.name, r.email].some((v) => (v ?? '').toLowerCase().includes(search.toLowerCase())))}
        rowKey="name"
        size="small"
        pagination={false}
        columns={[
          { title: 'Name', dataIndex: 'name', key: 'name',
            sorter: (a: any, b: any) => (a.name ?? '').localeCompare(b.name ?? ''),
          },
          { title: 'Email', dataIndex: 'email', key: 'email',
            sorter: (a: any, b: any) => (a.email ?? '').localeCompare(b.email ?? ''),
          },
          { title: 'Default', dataIndex: 'default_user', key: 'default',
            render: (v: boolean) => v ? 'Yes' : 'No',
          },
          { title: 'Actions', key: 'actions', width: 120,
            render: (_: unknown, record: any) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => {
                  setEditUser(record);
                  form.setFieldsValue(record);
                  setDrawerOpen(true);
                }} />
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.name)} />
              </Space>
            ),
          },
        ]}
      />
      <Drawer title={editUser ? 'Edit User' : 'Create User'} open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditUser(null); }} width={480}
        extra={<Button type="primary" onClick={handleSave} loading={saving}>Save</Button>}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Username" rules={[{ required: true }]}>
            <Input disabled={!!editUser} />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={editUser ? [] : [{ required: true, min: 8 }]}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
