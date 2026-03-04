import { useMemo } from 'react';
import { Card, Row, Col, Statistic, Spin, Alert } from 'antd';
import { DatabaseOutlined, TableOutlined, HddOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { getStats } from '../../baas/client';

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['db-stats'],
    queryFn: async () => await getStats().get(),
    staleTime: 30_000,
  });

  const stat = data?.stat;

  const schemaMap = useMemo(() => {
    const map = new Map<string, { tables: any[]; totalBytes: number }>();
    for (const t of stat?.tables ?? []) {
      const entry = map.get(t.schema_name) ?? { tables: [], totalBytes: 0 };
      entry.tables.push(t);
      entry.totalBytes += t.total_size_bytes ?? 0;
      map.set(t.schema_name, entry);
    }
    return map;
  }, [stat]);

  if (isLoading) return <Spin />;
  if (error) return <Alert type="error" message={String(error)} />;

  return (
    <div>
      <h2>Dashboard</h2>
      <Row gutter={16}>
        <Col span={8}>
          <Card><Statistic title="Schemas" value={schemaMap.size} prefix={<DatabaseOutlined />} /></Card>
        </Col>
        <Col span={8}>
          <Card><Statistic title="Tables" value={stat?.number_of_tables ?? 0} prefix={<TableOutlined />} /></Card>
        </Col>
        <Col span={8}>
          <Card><Statistic title="Database Size" value={stat?.total_size ?? 'N/A'} prefix={<HddOutlined />} /></Card>
        </Col>
      </Row>
      {schemaMap.size > 0 && (
        <Card title="Schemas" style={{ marginTop: 16 }}>
          <Row gutter={[16, 16]}>
            {[...schemaMap.entries()].map(([name, info]) => (
              <Col span={8} key={name}>
                <Card size="small" title={name}>
                  {info.tables.length} tables
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}
    </div>
  );
}
