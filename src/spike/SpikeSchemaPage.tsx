import { useState } from 'react';
import { Table, Button, Space, Input, Modal, Form, Tag, message, Alert } from 'antd';
import { PlusOutlined, DeleteOutlined, ExperimentOutlined } from '@ant-design/icons';
import { useLiveQuery } from '@tanstack/react-db';
import { useNavigate } from 'react-router-dom';
import { schemaCollection, type SchemaItem } from '../data/collections/schemas';
import { getErrorMessage } from '../baas/adminClient';
import { confirmDelete } from '../components/ConfirmDelete';

export default function SpikeSchemaPage() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();

  // Live query — subscribes to the schema collection.
  // Returns cached data instantly. Background refetch happens automatically
  // when data is stale (>30s) or on window focus.
  const result = useLiveQuery((q) =>
    q.from({ s: schemaCollection }),
  );

  const schemas: SchemaItem[] = (result?.data as SchemaItem[] | undefined) ?? [];

  const handleCreate = async () => {
    const values = await form.validateFields();
    try {
      // Optimistic insert — UI updates instantly, server persists in background.
      // If the server call fails, the optimistic state rolls back automatically.
      schemaCollection.insert({
        name: values.name,
        tables: [],
      });
      message.success(`Schema "${values.name}" created (optimistic)`);
      form.resetFields();
      setCreateOpen(false);
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    }
  };

  const handleDelete = (name: string) => {
    confirmDelete(name, async () => {
      try {
        // Optimistic delete — row disappears instantly from the live query.
        schemaCollection.delete(name);
        message.success(`Schema "${name}" deleted (optimistic)`);
      } catch (e: unknown) {
        message.error(getErrorMessage(e));
      }
    });
  };

  const tableData = schemas.map((s) => ({
    name: s.name,
    tableCount: s.tables?.length ?? 0,
  }));

  return (
    <div>
      <Alert
        type="info"
        showIcon
        icon={<ExperimentOutlined />}
        message="TanStack DB Spike"
        description="This page uses TanStack DB collections with live queries and optimistic mutations. Data is cached in-memory and served instantly. Create/delete operations are optimistic — the UI updates before the server responds."
        style={{ marginBottom: 16 }}
      />

      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <h2>Schemas (Client-First)</h2>
        <Space>
          <Tag color="green">{tableData.length} cached</Tag>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            New Schema
          </Button>
        </Space>
      </Space>

      <Table
        dataSource={tableData}
        rowKey="name"
        columns={[
          {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
            render: (name: string) => (
              <a onClick={() => navigate(`/spike/schemas/${name}`)}>{name}</a>
            ),
          },
          { title: 'Tables', dataIndex: 'tableCount', key: 'tableCount' },
          {
            title: 'Actions',
            key: 'actions',
            width: 100,
            render: (_: unknown, record: { name: string }) => (
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleDelete(record.name)}
              />
            ),
          },
        ]}
      />

      <Modal
        title="Create Schema"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Schema Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
