import { useState } from 'react';
import { Table, Button, Input, Tag } from 'antd';
import { message } from '../../utils/message';
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const handleCreate = async (values: any) => {
    setSaving(true);
    try {
      await getAdminClient().provisioning.constraints.postConstraint(schema, table, values);
      message.success('Constraint created');
      setDrawerOpen(false);
      onRefresh();
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSaving(false);
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
      <Button icon={<PlusOutlined />} onClick={() => setDrawerOpen(true)} style={{ marginBottom: 12 }}>
        Add Constraint
      </Button>
      <Input.Search placeholder="Search constraints..." allowClear onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12, maxWidth: 300 }} />
      <Table
        dataSource={constraints.filter((r: any) => !search || [r.name, r.constraint].some((v: string) => (v ?? '').toLowerCase().includes(search.toLowerCase())))}
        rowKey="name"
        size="small"
        pagination={false}
        columns={[
          { title: 'Name', dataIndex: 'name', key: 'name',
            sorter: (a: any, b: any) => (a.name ?? '').localeCompare(b.name ?? ''),
          },
          { title: 'Type', dataIndex: 'constraint', key: 'type',
            sorter: (a: any, b: any) => (a.constraint ?? '').localeCompare(b.constraint ?? ''),
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
      <ConstraintFormModal open={drawerOpen} columns={columns} onOk={handleCreate} onCancel={() => setDrawerOpen(false)} saving={saving} />
    </div>
  );
}
