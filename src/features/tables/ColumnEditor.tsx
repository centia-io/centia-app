import { useState } from 'react';
import { Table, Button, Space, Input, Tag, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { confirmDelete } from '../../components/ConfirmDelete';
import ColumnFormDrawer from './ColumnFormDrawer';

interface Props {
  schema: string;
  table: string;
  columns: any[];
  onRefresh: () => void;
}

export default function ColumnEditor({ schema, table, columns, onRefresh }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editCol, setEditCol] = useState<any>(null);
  const [search, setSearch] = useState('');

  const handleDelete = (name: string) => {
    confirmDelete(name, async () => {
      try {
        const admin = getAdminClient();
        await admin.provisioning.columns.deleteColumn(schema, table, name);
        message.success(`Column "${name}" deleted`);
        onRefresh();
      } catch (e: unknown) {
        message.error(getErrorMessage(e));
      }
    });
  };

  return (
    <div>
      <Button icon={<PlusOutlined />} onClick={() => { setEditCol(null); setDrawerOpen(true); }} style={{ marginBottom: 12 }}>
        Add Column
      </Button>
      <Input.Search placeholder="Search columns..." allowClear onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12, maxWidth: 300 }} />
      <Table
        dataSource={columns.filter((r: any) => !search || [r.name, r.type].some((v: string) => (v ?? '').toLowerCase().includes(search.toLowerCase())))}
        rowKey="name"
        size="small"
        pagination={false}
        columns={[
          { title: 'Name', dataIndex: 'name', key: 'name',
            sorter: (a: any, b: any) => (a.name ?? '').localeCompare(b.name ?? ''),
          },
          { title: 'Type', dataIndex: 'type', key: 'type',
            sorter: (a: any, b: any) => (a.type ?? '').localeCompare(b.type ?? ''),
          },
          { title: 'Nullable', dataIndex: 'is_nullable', key: 'nullable',
            render: (v: boolean) => v ? <Tag color="blue">YES</Tag> : <Tag>NO</Tag>,
          },
          { title: 'Default', dataIndex: 'default_value', key: 'default' },
          { title: 'Actions', key: 'actions', width: 100,
            render: (_: unknown, record: any) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => { setEditCol(record); setDrawerOpen(true); }} />
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.name)} />
              </Space>
            ),
          },
        ]}
      />
      <ColumnFormDrawer
        open={drawerOpen}
        schema={schema}
        table={table}
        column={editCol}
        onClose={() => setDrawerOpen(false)}
        onDone={() => { setDrawerOpen(false); onRefresh(); }}
      />
    </div>
  );
}
