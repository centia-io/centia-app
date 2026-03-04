import { useState } from 'react';
import { Table, Button, Space, Spin, Alert, message, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined, PlayCircleOutlined, CodeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '../../data/queryClient';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { confirmDelete } from '../../components/ConfirmDelete';
import RpcCallDrawer from './RpcCallDrawer';
import RpcTypesDrawer from './RpcTypesDrawer';

export default function RpcListPage() {
  const navigate = useNavigate();
  const [callMethod, setCallMethod] = useState<string | null>(null);
  const [typesOpen, setTypesOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['rpc-methods'],
    queryFn: async () => await getAdminClient().provisioning.rpcMethods.getRpc(),
    staleTime: 30_000,
  });

  const methods = Array.isArray(data) ? data : [];

  const handleDelete = (method: string) => {
    confirmDelete(method, async () => {
      try {
        await getAdminClient().provisioning.rpcMethods.deleteRpc(method);
        message.success('Method deleted');
        queryClient.invalidateQueries({ queryKey: ['rpc-methods'] });
      } catch (e: unknown) {
        message.error(getErrorMessage(e));
      }
    });
  };

  if (isLoading) return <Spin />;
  if (error) return <Alert type="error" message={String(error)} />;

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <h2>JSON-RPC Methods</h2>
        <Space>
          <Button icon={<CodeOutlined />} onClick={() => setTypesOpen(true)}>TypeScript Types</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/rpc/new')}>New Method</Button>
        </Space>
      </Space>
      <Table
        dataSource={methods}
        rowKey="method"
        size="small"
        columns={[
          { title: 'Method', dataIndex: 'method', key: 'method',
            render: (m: string) => <a onClick={() => navigate(`/rpc/${m}`)}>{m}</a>,
          },
          { title: 'Output Format', dataIndex: 'output_format', key: 'format',
            render: (v: string) => <Tag>{v ?? 'json'}</Tag>,
          },
          { title: 'Actions', key: 'actions', width: 200,
            render: (_: unknown, record: any) => (
              <Space>
                <Button size="small" icon={<PlayCircleOutlined />} onClick={() => setCallMethod(record.method)}>Call</Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.method)} />
              </Space>
            ),
          },
        ]}
      />
      <RpcCallDrawer method={callMethod} onClose={() => setCallMethod(null)} />
      <RpcTypesDrawer open={typesOpen} onClose={() => setTypesOpen(false)} />
    </div>
  );
}
