import { useState } from 'react';
import { Table, Button, Space, Drawer, Form, Input, Select, Spin, Alert, Switch, Tag } from 'antd';
import { message } from '../../utils/message';
import { PlusOutlined, DeleteOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { confirmDelete } from '../../components/ConfirmDelete';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '../../data/queryClient';
import { optimisticInsert, optimisticDelete, optimisticUpdate, rollback } from '../../data/optimistic';

/** Normalize user_group to a string array (tolerates the legacy JSON-string encoding). */
function toGroups(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string' && v.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

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

  /** Groups are users: any other user can act as a group for the one being edited. */
  const groupOptions = (users as any[])
    .map((u) => u.name as string)
    .filter((n) => n && n !== editUser?.name)
    .sort()
    .map((g) => ({ label: g, value: g }));

  const handleSave = async () => {
    const values = await form.validateFields();
    const isEdit = !!editUser;
    // default_user must always be sent explicitly: the API resets an omitted flag to false.
    const payload = {
      ...values,
      user_group: values.user_group?.length ? values.user_group : null,
      default_user: !!values.default_user,
    };
    setSaving(true);
    try {
      // A partial unique index allows only one default user, so demote the current one first.
      if (payload.default_user) {
        const previous = (users as any[]).find(
          (u) => u.default_user && u.name !== (isEdit ? editUser.name : values.name),
        );
        if (previous) {
          await getAdminClient().provisioning.users.patchUser(previous.name, {
            email: previous.email,
            password: null,
            default_user: false,
            user_group: toGroups(previous.user_group).length ? toGroups(previous.user_group) : null,
          });
        }
      }
      if (isEdit) {
        await getAdminClient().provisioning.users.patchUser(editUser.name, payload);
      } else {
        await getAdminClient().provisioning.users.postUser(payload);
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
            render: (v: string, record: any) => (
              <Space size={6}>
                {v}
                {record.default_user && <Tag color="blue" style={{ margin: 0 }}>default</Tag>}
              </Space>
            ),
          },
          { title: 'Email', dataIndex: 'email', key: 'email',
            sorter: (a: any, b: any) => (a.email ?? '').localeCompare(b.email ?? ''),
          },
          { title: 'Groups', dataIndex: 'user_group', key: 'groups',
            render: (v: unknown) => toGroups(v).map((g) => <Tag key={g}>{g}</Tag>),
          },
          { title: 'Actions', key: 'actions', width: 120,
            render: (_: unknown, record: any) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => {
                  setEditUser(record);
                  form.setFieldsValue({ ...record, user_group: toGroups(record.user_group) });
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
          <Form.Item name="user_group" label="Groups" tooltip="Group memberships. Any other user can act as a group.">
            <Select mode="multiple" allowClear showSearch placeholder="No groups" options={groupOptions} />
          </Form.Item>
          <Form.Item name="default_user" label="Default user" valuePropName="checked"
            tooltip="Only one user can be the default; setting it here removes the flag from the current default user.">
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
