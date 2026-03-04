import { useState } from 'react';
import { Table, Button, Space, Tag, message } from 'antd';
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
      <Table
        dataSource={columns}
        rowKey="name"
        size="small"
        columns={[
          { title: 'Name', dataIndex: 'name', key: 'name' },
          { title: 'Type', dataIndex: 'type', key: 'type' },
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
