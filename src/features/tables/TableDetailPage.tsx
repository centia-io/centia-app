import { useParams } from 'react-router-dom';
import { Tabs, Spin, Alert, Descriptions } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '../../data/queryClient';
import { getAdminClient } from '../../baas/adminClient';
import DataEditor from './DataEditor';
import ColumnEditor from './ColumnEditor';
import ConstraintManager from './ConstraintManager';
import IndexManager from './IndexManager';
import PrivilegeManager from './PrivilegeManager';
import MetadataManager from './MetadataManager';

export default function TableDetailPage() {
  const { s: schema, t: table } = useParams<{ s: string; t: string }>();

  const queryKey = ['table-detail', schema, table] as const;

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => await getAdminClient().provisioning.tables.getTable(schema!, table!),
    staleTime: 30_000,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey });

  if (isLoading) return <Spin />;
  if (error) return <Alert type="error" message={String(error)} />;

  const tableData = data as any;
  const columns = tableData?.columns ?? [];
  const constraints = tableData?.constraints ?? [];
  const indices = tableData?.indices ?? [];
  const columnNames = columns.map((c: any) => c.name);

  return (
    <div>
      <h2>{schema}.{table}</h2>
      {tableData?.comment && (
        <Descriptions size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="Comment">{tableData.comment}</Descriptions.Item>
        </Descriptions>
      )}
      <Tabs items={[
        { key: 'columns', label: `Columns (${columns.length})`,
          children: <ColumnEditor schema={schema!} table={table!} columns={columns} onRefresh={refetch} />,
        },
        { key: 'constraints', label: `Constraints (${constraints.length})`,
          children: <ConstraintManager schema={schema!} table={table!} constraints={constraints} columns={columnNames} onRefresh={refetch} />,
        },
        { key: 'indexes', label: `Indexes (${indices.length})`,
          children: <IndexManager schema={schema!} table={table!} indices={indices} columns={columnNames} onRefresh={refetch} />,
        },
        { key: 'privileges', label: 'Privileges',
          children: <PrivilegeManager schema={schema!} table={table!} />,
        },
        { key: 'metadata', label: 'Metadata',
          children: <MetadataManager schema={schema!} table={table!} />,
        },
        { key: 'data', label: 'Data',
          children: <DataEditor schema={schema!} table={table!} columns={columns} constraints={constraints} />,
        },
      ]} />
    </div>
  );
}
