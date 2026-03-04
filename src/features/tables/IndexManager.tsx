import { useState } from 'react';
import { Table, Button, Tag, message } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { confirmDelete } from '../../components/ConfirmDelete';
import IndexFormModal from './IndexFormModal';

interface Props {
  schema: string;
  table: string;
  indices: any[];
  columns: string[];
  onRefresh: () => void;
}

export default function IndexManager({ schema, table, indices, columns, onRefresh }: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  const handleCreate = async (values: any) => {
    const admin = getAdminClient();
    try {
      await admin.provisioning.indices.postIndex(schema, table, values);
      message.success('Index created');
      setModalOpen(false);
      onRefresh();
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    }
  };

  const handleDelete = (name: string) => {
    confirmDelete(name, async () => {
      try {
        const admin = getAdminClient();
        await admin.provisioning.indices.deleteIndex(schema, table, name);
        message.success('Index deleted');
        onRefresh();
      } catch (e: unknown) {
        message.error(getErrorMessage(e));
      }
    });
  };

  return (
    <div>
      <Button icon={<PlusOutlined />} onClick={() => setModalOpen(true)} style={{ marginBottom: 12 }}>
        Create Index
      </Button>
      <Table
        dataSource={indices}
        rowKey="name"
        size="small"
        columns={[
          { title: 'Name', dataIndex: 'name', key: 'name' },
          { title: 'Method', dataIndex: 'method', key: 'method',
            render: (v: string) => <Tag>{v}</Tag>,
          },
          { title: 'Columns', dataIndex: 'columns', key: 'columns',
            render: (v: string[]) => v?.join(', ') ?? '',
          },
          { title: 'Actions', key: 'actions', width: 80,
            render: (_: unknown, record: any) => (
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.name)} />
            ),
          },
        ]}
      />
      <IndexFormModal open={modalOpen} columns={columns} onOk={handleCreate} onCancel={() => setModalOpen(false)} />
    </div>
  );
}
