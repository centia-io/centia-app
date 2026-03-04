import { useState } from 'react';
import { Table, Button, Space, Modal, Form, Input, Spin, Alert, message, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { confirmDelete } from '../../components/ConfirmDelete';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '../../data/queryClient';
import { optimisticInsert, optimisticDelete, optimisticUpdate, rollback } from '../../data/optimistic';

export default function UserListPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [form] = Form.useForm();

  const { data, isLoading, error, isFetching, isStale } = useQuery({
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
    const { password: _pw, ...displayValues } = values;
    const ctx = isEdit
      ? optimisticUpdate(['users'], 'name', editUser.name, displayValues)
      : optimisticInsert(['users'], { ...displayValues });
    form.resetFields();
    setModalOpen(false);
    setEditUser(null);
    try {
      if (isEdit) {
        await getAdminClient().provisioning.users.patchUser(editUser.name, values);
      } else {
        await getAdminClient().provisioning.users.postUser(values);
      }
      message.success(isEdit ? 'User updated' : 'User created');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (e: unknown) {
      rollback(ctx);
      message.error(getErrorMessage(e));
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
          <Tag color={isStale ? 'orange' : 'green'}>{isStale ? 'stale' : 'fresh'}</Tag>
          {isFetching && <Tag color="blue">refetching...</Tag>}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditUser(null); form.resetFields(); setModalOpen(true); }}>
            New User
          </Button>
        </Space>
      </Space>
      <Table
        dataSource={users}
        rowKey="name"
        size="small"
        columns={[
          { title: 'Name', dataIndex: 'name', key: 'name' },
          { title: 'Email', dataIndex: 'email', key: 'email' },
          { title: 'Default', dataIndex: 'default_user', key: 'default',
            render: (v: boolean) => v ? 'Yes' : 'No',
          },
          { title: 'Actions', key: 'actions', width: 120,
            render: (_: unknown, record: any) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => {
                  setEditUser(record);
                  form.setFieldsValue(record);
                  setModalOpen(true);
                }} />
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.name)} />
              </Space>
            ),
          },
        ]}
      />
      <Modal title={editUser ? 'Edit User' : 'Create User'} open={modalOpen}
        onOk={handleSave} onCancel={() => { setModalOpen(false); setEditUser(null); }}>
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
      </Modal>
    </div>
  );
}
