import { useMemo } from 'react';
import { Button, Select, Space, Spin, Alert, Typography } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { getSql } from '../../baas/client';
import { useQueries } from '@tanstack/react-query';
import type { SchemaInfo } from '@centia-io/sdk';
import { getAdminClient } from '../../baas/adminClient';
import { useSchemaNames } from '../../hooks/useSchemaNames';
import { sql as sqlLang, PostgreSQL, type SQLNamespace } from '@codemirror/lang-sql';
import { sqlStore, useSqlStore } from './sqlStore';

const DQL_KEYWORDS = new Set([
  'select', 'from', 'where', 'and', 'or', 'not', 'in', 'between', 'like', 'ilike',
  'is', 'null', 'true', 'false', 'as', 'on', 'using', 'join', 'inner', 'left',
  'right', 'full', 'outer', 'cross', 'natural', 'order', 'by', 'asc', 'desc',
  'nulls', 'first', 'last', 'group', 'having', 'limit', 'offset', 'union', 'all',
  'intersect', 'except', 'distinct', 'case', 'when', 'then', 'else', 'end',
  'exists', 'any', 'some', 'cast', 'coalesce', 'nullif', 'greatest', 'least',
  'count', 'sum', 'avg', 'min', 'max', 'array_agg', 'string_agg', 'json_agg',
  'jsonb_agg', 'row_number', 'rank', 'dense_rank', 'over', 'partition', 'window',
  'filter', 'within', 'lateral', 'with', 'recursive', 'fetch', 'next', 'rows',
  'only', 'for', 'update', 'insert', 'into', 'values', 'set', 'delete',
  'returning', 'default', 'do', 'nothing', 'conflict', 'excluded',
]);
import CodeEditor from '../../components/CodeEditor';
import ResultTable from '../../components/ResultTable';

export default function SqlConsolePage() {
  const { query, format, selectedSchemas, result, rawResult, error, loading } = useSqlStore();

  const { data: schemasData, isLoading: schemasLoading, error: schemasError } = useSchemaNames();
  const schemas: string[] = (schemasData?.map((s) => s.name) ?? []).sort();

  // One cached query per selected schema, fetched in parallel: changing the
  // selection only fetches the newly added schemas.
  const schemaDetails = useQueries({
    queries: selectedSchemas.map((s) => ({
      queryKey: ['sql-autocomplete', s],
      queryFn: async () => (await getAdminClient().provisioning.schemas.getSchema(s)) as SchemaInfo,
      staleTime: 5 * 60_000,
    })),
  });
  const detailsKey = schemaDetails.map((q) => q.dataUpdatedAt).join(',');
  const sqlSchema = useMemo<SQLNamespace>(() => {
    const ns: SQLNamespace = {};
    selectedSchemas.forEach((s, i) => {
      for (const t of schemaDetails[i]?.data?.tables ?? []) {
        const qualifiedName = `${s}.${t.name}`;
        ns[qualifiedName] = (t.columns ?? []).map((c) => c.name);
        // Also add unqualified name for convenience
        if (!ns[t.name]) ns[t.name] = ns[qualifiedName];
      }
    });
    return ns;
  }, [selectedSchemas, detailsKey]);

  const sqlExtensions = useMemo(
    () => [sqlLang({
      dialect: PostgreSQL,
      schema: sqlSchema,
      upperCaseKeywords: true,
      keywordCompletion: (label, type) => ({
        label,
        type,
        boost: DQL_KEYWORDS.has(label.toLowerCase()) ? -1 : -9999,
      }),
    })],
    [sqlSchema],
  );

  const run = async () => {
    sqlStore.set({ loading: true, error: null, result: null, rawResult: null });
    try {
      const res = await getSql().exec({ q: query });
      sqlStore.set({ result: res });
    } catch (e: any) {
      sqlStore.set({ error: e.message ?? String(e) });
    } finally {
      sqlStore.set({ loading: false });
    }
  };

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>SQL Console</h2>
        <Select
          mode="multiple"
          placeholder="Schemas for autocomplete"
          value={selectedSchemas}
          onChange={(v) => sqlStore.set({ selectedSchemas: v })}
          options={schemas.map((s) => ({ label: s, value: s }))}
          style={{ minWidth: 250 }}
          maxTagCount="responsive"
          allowClear
          loading={schemasLoading}
          notFoundContent={schemasLoading ? <Spin size="small" /> : schemasError ? 'Failed to load' : undefined}
        />
      </Space>
      <CodeEditor
        value={query}
        onChange={(v) => sqlStore.set({ query: v })}
        language="sql"
        height="200px"
        onRun={run}
        extensions={sqlExtensions}
      />
      <Space style={{ marginTop: 12, marginBottom: 12 }}>
        <Button type="primary" icon={<PlayCircleOutlined />} onClick={run} loading={loading}>
          Run (Ctrl+Enter)
        </Button>
        <Select
          value={format}
          onChange={(v) => sqlStore.set({ format: v })}
          style={{ width: 120 }}
          options={[
            { label: 'JSON', value: 'json' },
            { label: 'CSV', value: 'csv' },
            { label: 'GeoJSON', value: 'geojson' },
          ]}
        />
      </Space>
      {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} />}
      {loading && <Spin />}
      {result && (
        <div>
          <Typography.Text type="secondary">{result.data?.length ?? 0} rows returned</Typography.Text>
          <ResultTable data={result.data} schema={result.schema} />
        </div>
      )}
      {rawResult && (
        <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, maxHeight: 400, overflow: 'auto' }}>
          {rawResult}
        </pre>
      )}
    </div>
  );
}
