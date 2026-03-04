import { useParams, useNavigate } from 'react-router-dom';
import { Table, Spin, Alert, Tag, Space, Button } from 'antd';
import { ArrowLeftOutlined, ExperimentOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { getAdminClient } from '../baas/adminClient';

/**
 * Table list within a schema — uses TanStack Query's useQuery directly
 * (not TanStack DB collections) to demonstrate stale-while-revalidate caching.
 *
 * Navigate away and back: data appears instantly from cache while
 * a background refetch runs. The "stale" tag shows the cache state.
 */
export default function SpikeTablePage() {
  const { s: schema } = useParams<{ s: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error, isFetching, isStale } = useQuery({
    queryKey: ['schema-detail', schema],
    queryFn: async () => {
      const admin = getAdminClient();
      return await admin.provisioning.schemas.getSchema(schema!);
    },
    staleTime: 30_000,
  });

  if (isLoading) return <Spin />;
  if (error) return <Alert type="error" message={String(error)} />;

  const tables =
    (data as any)?.tables?.map((t: any) => ({
      name: t.name,
      columnCount: t.columns?.length ?? 0,
    })) ?? [];

  return (
    <div>
      <Alert
        type="info"
        showIcon
        icon={<ExperimentOutlined />}
        message="TanStack Query — Stale-While-Revalidate"
        description="This page uses TanStack Query's useQuery with 30s staleTime. Navigate away and back — data appears instantly from cache. The tags below show cache state."
        style={{ marginBottom: 16 }}
      />

      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/spike/schemas')} />
          <h2>Tables in "{schema}"</h2>
        </Space>
        <Space>
          <Tag color={isStale ? 'orange' : 'green'}>{isStale ? 'stale' : 'fresh'}</Tag>
          {isFetching && <Tag color="blue">refetching...</Tag>}
          <Tag>{tables.length} tables</Tag>
        </Space>
      </Space>

      <Table
        dataSource={tables}
        rowKey="name"
        size="small"
        columns={[
          { title: 'Name', dataIndex: 'name', key: 'name' },
          { title: 'Columns', dataIndex: 'columnCount', key: 'columnCount' },
        ]}
      />
    </div>
  );
}
