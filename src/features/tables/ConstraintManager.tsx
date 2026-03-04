import { useState } from 'react';
import { Table, Button, Tag, message } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { confirmDelete } from '../../components/ConfirmDelete';
import ConstraintFormModal from './ConstraintFormModal';

interface Props {
  schema: string;
  table: string;
  constraints: any[];
  columns: string[];
  onRefresh: () => void;
}

export default function ConstraintManager({ schema, table, constraints, columns, onRefresh }: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  const handleCreate = async (values: any) => {
    const admin = getAdminClient();
    try {
      await admin.provisioning.constraints.postConstraint(schema, table, values);
      message.success('Constraint created');
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
        await admin.provisioning.constraints.deleteConstraint(schema, table, name);
        message.success('Constraint deleted');
        onRefresh();
      } catch (e: unknown) {
        message.error(getErrorMessage(e));
      }
    });
  };

  return (
    <div>
      <Button icon={<PlusOutlined />} onClick={() => setModalOpen(true)} style={{ marginBottom: 12 }}>
        Add Constraint
      </Button>
      <Table
        dataSource={constraints}
        rowKey="name"
        size="small"
        columns={[
          { title: 'Name', dataIndex: 'name', key: 'name' },
          { title: 'Type', dataIndex: 'constraint', key: 'type',
            render: (v: string) => <Tag color={v === 'primary' ? 'gold' : v === 'foreign' ? 'blue' : 'default'}>{v}</Tag>,
          },
          { title: 'Columns', dataIndex: 'columns', key: 'columns',
            render: (v: string[]) => v?.join(', ') ?? '',
          },
          { title: 'References', key: 'ref',
            render: (_: unknown, r: any) => r.referenced_table ? `${r.referenced_table}(${r.referenced_columns?.join(', ')})` : '',
          },
          { title: 'Actions', key: 'actions', width: 80,
            render: (_: unknown, record: any) => (
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.name)} />
            ),
          },
        ]}
      />
      <ConstraintFormModal open={modalOpen} columns={columns} onOk={handleCreate} onCancel={() => setModalOpen(false)} />
    </div>
  );
}
