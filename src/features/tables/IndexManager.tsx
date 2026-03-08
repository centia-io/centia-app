import { useState } from 'react';
import { Table, Button, Input, Tag } from 'antd';
import { message } from '../../utils/message';
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const handleCreate = async (values: any) => {
    setSaving(true);
    try {
      await getAdminClient().provisioning.indices.postIndex(schema, table, values);
      message.success('Index created');
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
      <Button icon={<PlusOutlined />} onClick={() => setDrawerOpen(true)} style={{ marginBottom: 12 }}>
        Create Index
      </Button>
      <Input.Search placeholder="Search indexes..." allowClear onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12, maxWidth: 300 }} />
      <Table
        dataSource={indices.filter((r: any) => !search || [r.name, r.method].some((v: string) => (v ?? '').toLowerCase().includes(search.toLowerCase())))}
        rowKey="name"
        size="small"
        pagination={false}
        columns={[
          { title: 'Name', dataIndex: 'name', key: 'name',
            sorter: (a: any, b: any) => (a.name ?? '').localeCompare(b.name ?? ''),
          },
          { title: 'Method', dataIndex: 'method', key: 'method',
            sorter: (a: any, b: any) => (a.method ?? '').localeCompare(b.method ?? ''),
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
      <IndexFormModal open={drawerOpen} columns={columns} onOk={handleCreate} onCancel={() => setDrawerOpen(false)} saving={saving} />
    </div>
  );
}
