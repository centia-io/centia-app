import { Select, Space } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { getStats } from '../baas/client';

interface Props {
  schema: string | null;
  table: string | null;
  onSchemaChange: (s: string) => void;
  onTableChange: (t: string) => void;
}

export default function SchemaTableSelect({ schema, table, onSchemaChange, onTableChange }: Props) {
  const { data: statsData } = useQuery({
    queryKey: ['db-stats'],
    queryFn: async () => await getStats().get(),
    staleTime: 30_000,
  });

  const allTables: { table_name: string; schema_name: string }[] = statsData?.tables ?? [];
  const schemas: string[] = [...new Set(allTables.map((t) => t.schema_name))].sort();
  const tables: string[] = allTables.filter((t) => t.schema_name === schema).map((t) => t.table_name).sort();

  return (
    <Space>
      <Select
        placeholder="Schema"
        value={schema}
        onChange={(v) => { onSchemaChange(v); onTableChange(''); }}
        options={schemas.map((s) => ({ label: s, value: s }))}
        style={{ width: 200 }}
        allowClear
      />
      <Select
        placeholder="Table"
        value={table || undefined}
        onChange={onTableChange}
        options={tables.map((t) => ({ label: t, value: t }))}
        style={{ width: 200 }}
        disabled={!schema}
        allowClear
      />
    </Space>
  );
}
