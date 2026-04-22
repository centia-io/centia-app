import { useState, useEffect, useMemo } from 'react';
import { Select, Space, Spin, Alert, Button, Card, Tree, Typography } from 'antd';
import { PlayCircleOutlined, FileTextOutlined } from '@ant-design/icons';
import { getGql } from '../../baas/client';
import { getErrorMessage } from '../../baas/adminClient';
import { useSchemaNames } from '../../hooks/useSchemaNames';
import { buildClientSchema, getIntrospectionQuery, type IntrospectionQuery, type GraphQLSchema } from 'graphql';
import { graphql as graphqlExt } from 'cm6-graphql';
import CodeEditor from '../../components/CodeEditor';
import ResultTable from '../../components/ResultTable';
import type { DataNode } from 'antd/es/tree';

function formatType(t: any): string {
  if (!t) return '';
  if (t.kind === 'NON_NULL') return `${formatType(t.ofType)}!`;
  if (t.kind === 'LIST') return `[${formatType(t.ofType)}]`;
  return t.name ?? '';
}

function buildSchemaTree(introSchema: any): DataNode[] {
  if (!introSchema?.types) return [];
  const userTypes = introSchema.types.filter(
    (t: any) => !t.name.startsWith('__') && t.kind === 'OBJECT' && t.fields?.length,
  );
  return userTypes.map((type: any) => ({
    key: type.name,
    title: type.name,
    icon: <FileTextOutlined />,
    children: type.fields.map((f: any) => {
      const args = f.args?.length
        ? `(${f.args.map((a: any) => `${a.name}: ${formatType(a.type)}`).join(', ')})`
        : '';
      return {
        key: `${type.name}.${f.name}`,
        title: (
          <span>
            <strong>{f.name}</strong>{args}: <Typography.Text type="secondary">{formatType(f.type)}</Typography.Text>
          </span>
        ),
        isLeaf: true,
      };
    }),
  }));
}

export default function GraphqlExplorerPage() {
  const { data: schemasData, isLoading: schemasLoading, error: schemasError, refetch } = useSchemaNames();
  const schemas: string[] = (schemasData?.map((s) => s.name) ?? []).sort();

  const [schema, setSchema] = useState('');
  const [query, setQuery] = useState('{\n  \n}');
  const [variables, setVariables] = useState('{}');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [schemaTree, setSchemaTree] = useState<DataNode[]>([]);
  const [introLoading, setIntroLoading] = useState(false);
  const [gqlSchema, setGqlSchema] = useState<GraphQLSchema | null>(null);

  useEffect(() => {
    if (!schema) { setSchemaTree([]); setGqlSchema(null); return; }
    setIntroLoading(true);
    getGql(schema)
      .request({ query: getIntrospectionQuery() })
      .then((res) => {
        const introData = (res.data as unknown) as IntrospectionQuery;
        setSchemaTree(buildSchemaTree(introData.__schema));
        setGqlSchema(buildClientSchema(introData));
      })
      .catch(() => { setSchemaTree([]); setGqlSchema(null); })
      .finally(() => setIntroLoading(false));
  }, [schema]);

  const gqlExtensions = useMemo(
    () => gqlSchema ? [graphqlExt(gqlSchema)] : [],
    [gqlSchema],
  );

  const run = async () => {
    if (!schema) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const vars = JSON.parse(variables);
      const res = await getGql(schema).request({ query, variables: vars });
      if (res.errors?.length) {
        setError(res.errors.map((e: { message: string }) => e.message).join('\n'));
      }
      setResult(res.data);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const resultData = result ? Object.values(result).flat() : null;

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>GraphQL Explorer</h2>
        <Select
          placeholder="Select schema"
          value={schema || undefined}
          onChange={(v) => { setSchema(v); setResult(null); setError(null); }}
          options={schemas.map((s) => ({ label: s, value: s }))}
          style={{ width: 200 }}
          loading={schemasLoading}
          notFoundContent={schemasLoading ? <Spin size="small" /> : undefined}
        />
      </Space>
      {schemasError && (
        <Alert
          type="error"
          message="Could not load schemas"
          description={getErrorMessage(schemasError)}
          action={<Button size="small" onClick={() => refetch()}>Retry</Button>}
          style={{ marginBottom: 12 }}
        />
      )}
      {schema && (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 12 }}>
          <Card
            title="Schema"
            size="small"
            style={{ maxHeight: 'calc(100vh - 180px)', overflow: 'auto' }}
          >
            {introLoading ? (
              <Spin size="small" />
            ) : schemaTree.length > 0 ? (
              <Tree
                treeData={schemaTree}
                showIcon
                defaultExpandedKeys={schemaTree.slice(0, 2).map((n) => n.key)}
                selectable={false}
              />
            ) : (
              <Typography.Text type="secondary">No schema loaded</Typography.Text>
            )}
          </Card>
          <div>
            <Typography.Text strong>Query</Typography.Text>
            <CodeEditor
              value={query}
              onChange={setQuery}
              language="graphql"
              height="300px"
              onRun={run}
              extensions={gqlExtensions}
            />
            <Typography.Text strong style={{ display: 'block', marginTop: 8 }}>Variables</Typography.Text>
            <CodeEditor value={variables} onChange={setVariables} language="json" height="150px" />
            <Space style={{ marginTop: 12, marginBottom: 12 }}>
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={run} loading={loading}>
                Run (Ctrl+Enter)
              </Button>
            </Space>
            {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} />}
            {loading && <Spin />}
            {result && (
              Array.isArray(resultData) && resultData.length > 0 && typeof resultData[0] === 'object'
                ? <ResultTable data={resultData as Record<string, unknown>[]} />
                : <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 16, borderRadius: 6, maxHeight: 500, overflow: 'auto' }}>
                    {JSON.stringify(result, null, 2)}
                  </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
