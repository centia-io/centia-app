// src/features/realtime/EnableEvents.tsx
import { useState } from 'react';
import { Select, Switch, List, Spin, App } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSchemaNames } from '../../hooks/useSchemaNames';
import { getEventsStatus, setEventsEnabled } from './eventsApi';
import { optimisticUpdate, rollback } from '../../data/optimistic';

export default function EnableEvents() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [schema, setSchema] = useState<string | undefined>();
  const [togglingTable, setTogglingTable] = useState<string | null>(null);

  const { data: schemasData, isLoading: schemasLoading } = useSchemaNames();
  const schemas: string[] = (schemasData?.map((s) => s.name) ?? []).sort();

  const { data: tableStatuses, isLoading: tablesLoading } = useQuery({
    queryKey: ['events-status', schema],
    queryFn: () => getEventsStatus(schema!),
    enabled: !!schema,
  });

  const handleToggle = async (table: string, enabled: boolean) => {
    const queryKey = ['events-status', schema];
    const ctx = optimisticUpdate(queryKey, 'table', table, { enabled });
    setTogglingTable(table);
    try {
      await setEventsEnabled(schema!, table, enabled);
      queryClient.invalidateQueries({ queryKey });
    } catch (e: any) {
      rollback(ctx);
      message.error(e.message ?? 'Failed to toggle events');
    } finally {
      setTogglingTable(null);
    }
  };

  return (
    <div>
      <Select
        placeholder="Select schema"
        value={schema}
        onChange={setSchema}
        options={schemas?.map((s) => ({ label: s, value: s }))}
        loading={schemasLoading}
        style={{ width: '100%', marginBottom: 12 }}
        allowClear
      />
      {tablesLoading && <Spin size="small" />}
      {tableStatuses && (
        <List
          size="small"
          dataSource={tableStatuses}
          renderItem={(item) => (
            <List.Item
              style={{ padding: '6px 0', display: 'flex', justifyContent: 'space-between' }}
            >
              <span style={{ fontSize: 13 }}>{item.table}</span>
              <Switch
                size="small"
                checked={item.enabled}
                loading={togglingTable === item.table}
                onChange={(checked) => handleToggle(item.table, checked)}
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );
}
