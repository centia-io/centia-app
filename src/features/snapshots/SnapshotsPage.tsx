import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, AutoComplete, Button, Card, Descriptions, InputNumber, Popover, Select, Space, Spin,
  Table, Tag, Tooltip, Typography,
} from 'antd';
import {
  CameraOutlined, CopyOutlined, DownloadOutlined, LinkOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Snapshots, isCentiaApiError } from '@centia-io/sdk';
import type { RelationSnapshot, SnapshotJob, SnapshotStatus } from '@centia-io/sdk';
import { message } from '../../utils/message';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { getStatus } from '../../baas/client';
import { useAuth } from '../../auth/AuthProvider';
import { queryClient } from '../../data/queryClient';

const { Text, Paragraph } = Typography;

/** Only plain identifiers can be snapshotted. */
const RELATION_NAME = /^[A-Za-z0-9_-]+$/;

function snapshotsClient() {
  return new Snapshots(getAdminClient().http);
}

const STATUS_COLOR: Record<SnapshotStatus, string> = {
  pending: 'default',
  running: 'processing',
  succeeded: 'success',
  failed: 'error',
  superseded: 'warning',
};

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = -1;
  do {
    v /= 1024;
    i++;
  } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

function apiErrorCode(e: unknown): string | null {
  return isCentiaApiError(e) ? ((e as { errorCode?: string }).errorCode ?? null) : null;
}

/** Save a fetched snapshot file to disk via a blob URL (Authorization cannot ride on <a href>). */
async function saveResponse(res: Response, filename: string) {
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function DuckDbPopover({ dataUrl }: { dataUrl: string }) {
  const token = getStatus().getTokens().accessToken;
  const snippet = [
    `CREATE SECRET gc2 (TYPE http, BEARER_TOKEN '${token}');`,
    `SELECT * FROM read_parquet('${dataUrl}');`,
  ].join('\n');
  return (
    <Popover
      trigger="click"
      title="Use in DuckDB"
      content={
        <Space direction="vertical" style={{ maxWidth: 560 }}>
          <Paragraph style={{ marginBottom: 0 }}>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12 }}>{snippet}</pre>
          </Paragraph>
          <Text type="secondary" style={{ fontSize: 12 }}>
            The snippet contains your current access token, which expires after about an hour —
            create a fresh one when it does.
          </Text>
          <Button
            size="small"
            icon={<CopyOutlined />}
            onClick={async () => {
              await navigator.clipboard.writeText(snippet);
              message.success('Snippet copied');
            }}
          >
            Copy snippet
          </Button>
        </Space>
      }
    >
      <Button size="small">DuckDB</Button>
    </Popover>
  );
}

export default function SnapshotsPage() {
  const { user } = useAuth();
  const isSuperUser = user?.superUser === true;

  const [schema, setSchema] = useState<string | null>(null);
  const [relation, setRelation] = useState<string>('');
  const [srs, setSrs] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);

  const { data: schemas = [] } = useQuery({
    queryKey: ['schema-names'],
    queryFn: async () =>
      (await getAdminClient().provisioning.schemas.getSchema(undefined, { namesOnly: true })).map((s) => s.name),
    staleTime: 30_000,
  });

  const { data: relationNames = [] } = useQuery({
    queryKey: ['table-names', schema],
    queryFn: async () =>
      ((await getAdminClient().provisioning.tables.getTable(schema!, undefined, { namesOnly: true })) as unknown as
        { name: string }[]).map((t) => t.name),
    enabled: !!schema,
    staleTime: 30_000,
  });

  const relationValid = RELATION_NAME.test(relation);
  const relationChosen = !!schema && relationValid;

  // ──── Job list (super-user) ────

  const jobsQuery = useQuery({
    queryKey: ['snapshot-jobs', schema, relationChosen ? relation : null],
    queryFn: async () =>
      await snapshotsClient().getSnapshots({
        schema: schema ?? undefined,
        relation: relationChosen ? relation : undefined,
      }),
    enabled: isSuperUser,
    refetchInterval: (q) =>
      (q.state.data ?? []).some((j: SnapshotJob) => j.status === 'pending' || j.status === 'running') ? 3000 : false,
  });
  const jobs = jobsQuery.data ?? [];

  // When the last active job finishes, the published list may have grown —
  // refresh it (and once on the pending→terminal transition of a fresh queue).
  const hasActive = jobs.some((j) => j.status === 'pending' || j.status === 'running');
  const hadActive = useRef(false);
  useEffect(() => {
    if (hadActive.current && !hasActive) {
      queryClient.invalidateQueries({ queryKey: ['relation-snapshots'] });
    }
    hadActive.current = hasActive;
  }, [hasActive]);

  // ──── Published snapshots for the chosen relation ────

  const snapsQuery = useQuery({
    queryKey: ['relation-snapshots', schema, relation],
    queryFn: async () => {
      try {
        return await snapshotsClient().getRelationSnapshots(schema!, relation);
      } catch (e) {
        if (apiErrorCode(e) === 'NO_SNAPSHOT_ERROR') return [];
        throw e;
      }
    },
    enabled: relationChosen,
    staleTime: 15_000,
  });
  const snaps = snapsQuery.data ?? [];

  const handleCreate = async () => {
    if (!relationChosen) return;
    setCreating(true);
    try {
      await snapshotsClient().postSnapshot({ schema: schema!, relation, srs: srs ?? undefined });
      message.success('Snapshot queued');
      queryClient.invalidateQueries({ queryKey: ['snapshot-jobs'] });
    } catch (e) {
      const code = apiErrorCode(e);
      if (code === 'SNAPSHOT_IN_PROGRESS') {
        message.warning('A snapshot of this relation is already pending or running.');
      } else if (code === 'SNAPSHOT_NOT_CONFIGURED') {
        setNotConfigured(true);
      } else {
        message.error(getErrorMessage(e));
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (snap: RelationSnapshot) => {
    try {
      const res = await snapshotsClient().getRelationSnapshotData(schema!, relation, snap.snapshot_date);
      await saveResponse(res, `${schema}.${relation}-${snap.snapshot_date}.parquet`);
    } catch (e) {
      if (apiErrorCode(e) === 'MULTI_FILE_SNAPSHOT') {
        message.warning('This snapshot has several files — download them individually from the row details.');
      } else {
        message.error(getErrorMessage(e));
      }
    }
  };

  const handleDownloadFile = async (snap: RelationSnapshot, name: string) => {
    try {
      const res = await snapshotsClient().getRelationSnapshotFile(schema!, relation, snap.snapshot_date, name);
      await saveResponse(res, name);
    } catch (e) {
      message.error(getErrorMessage(e));
    }
  };

  /** "schema changed" when the fingerprint differs from the next-older snapshot. */
  const schemaChanged = useMemo(() => {
    const changed = new Set<string>();
    for (let i = 0; i < snaps.length - 1; i++) {
      if (snaps[i].schema_version !== snaps[i + 1].schema_version) changed.add(snaps[i].snapshot_date);
    }
    return changed;
  }, [snaps]);

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <h2>Snapshots</h2>
      </Space>

      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message={
          <>
            A snapshot is an immutable GeoParquet copy of a table or view, stored per
            schema/relation/date. There is at most one snapshot per relation per UTC day — rerunning
            an export the same day replaces it. Exports run asynchronously and usually take seconds
            to a few minutes.
          </>
        }
      />

      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="Select schema"
          style={{ width: 240 }}
          showSearch
          value={schema}
          onChange={(v) => {
            setSchema(v);
            setRelation('');
          }}
          options={schemas.map((name) => ({ label: name, value: name }))}
        />
        <AutoComplete
          placeholder="Table, view or matview"
          style={{ width: 280 }}
          value={relation}
          onChange={setRelation}
          disabled={!schema}
          options={relationNames
            .filter((n) => RELATION_NAME.test(n))
            .map((n) => ({ value: n }))}
          filterOption={(input, option) => (option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
        />
        {relation && !relationValid && (
          <Text type="danger">Only names matching A-Z, 0-9, _ and - can be snapshotted.</Text>
        )}
      </Space>

      {isSuperUser && (
        <Card
          title="Create snapshot"
          size="small"
          style={{ marginBottom: 16 }}
          extra={<Text type="secondary">Super-user only</Text>}
        >
          {notConfigured ? (
            <Alert
              type="warning"
              showIcon
              message="Snapshots are not configured on this server (no snapshot storage). Ask the operator to configure it."
            />
          ) : (
            <Space wrap>
              <InputNumber
                placeholder="Target SRS (EPSG), optional"
                style={{ width: 220 }}
                min={1}
                value={srs}
                onChange={(v) => setSrs(v)}
              />
              <Button
                type="primary"
                icon={<CameraOutlined />}
                disabled={!relationChosen}
                loading={creating}
                onClick={handleCreate}
              >
                Create snapshot
              </Button>
              <Text type="secondary">Leave SRS empty to keep the native SRID.</Text>
            </Space>
          )}
        </Card>
      )}

      {isSuperUser && (
        <Card
          title="Jobs"
          size="small"
          style={{ marginBottom: 16 }}
          extra={
            <Button size="small" icon={<ReloadOutlined />} onClick={() => jobsQuery.refetch()}>
              Refresh
            </Button>
          }
        >
          <Table
            dataSource={jobs}
            rowKey="id"
            size="small"
            pagination={false}
            loading={jobsQuery.isLoading}
            columns={[
              { title: 'Relation', key: 'relation',
                render: (_: unknown, j: SnapshotJob) => <Text code>{`${j.schema}.${j.relation}`}</Text>,
              },
              { title: 'Status', dataIndex: 'status', key: 'status',
                render: (s: SnapshotStatus, j: SnapshotJob) =>
                  j.error ? (
                    <Tooltip title={j.error}>
                      <Tag color={STATUS_COLOR[s]}>{s}</Tag>
                    </Tooltip>
                  ) : (
                    <Tag color={STATUS_COLOR[s]}>{s}</Tag>
                  ),
              },
              { title: 'Rows', dataIndex: 'row_count', key: 'rows',
                render: (v: number | null) => v?.toLocaleString() ?? '—',
              },
              { title: 'SRS', dataIndex: 'srs', key: 'srs', render: (v: number | null) => v ?? 'native' },
              { title: 'Created', dataIndex: 'created', key: 'created' },
              { title: 'Finished', dataIndex: 'finished', key: 'finished', render: (v: string | null) => v ?? '—' },
              { title: 'By', dataIndex: 'username', key: 'username' },
            ]}
          />
        </Card>
      )}

      <Card title="Published snapshots" size="small">
        {!relationChosen ? (
          <Text type="secondary">Select a schema and relation to list its snapshots.</Text>
        ) : snapsQuery.isLoading ? (
          <Spin />
        ) : snapsQuery.error ? (
          <Alert type="error" showIcon message={getErrorMessage(snapsQuery.error)} />
        ) : (
          <Table
            dataSource={snaps}
            rowKey="snapshot_date"
            size="small"
            pagination={false}
            locale={{ emptyText: 'No snapshots for this relation yet.' }}
            expandable={{
              expandedRowRender: (snap: RelationSnapshot) => (
                <SnapshotDetails
                  schema={schema!}
                  relation={relation}
                  snap={snap}
                  onDownloadFile={(name) => handleDownloadFile(snap, name)}
                />
              ),
            }}
            columns={[
              { title: 'Date', dataIndex: 'snapshot_date', key: 'date' },
              { title: 'Rows', dataIndex: 'row_count', key: 'rows', render: (v: number) => v.toLocaleString() },
              { title: 'Size', dataIndex: 'size_bytes', key: 'size', render: (v: number) => humanBytes(v) },
              { title: 'Schema', dataIndex: 'schema_version', key: 'sv',
                render: (v: string, snap: RelationSnapshot) => (
                  <Space size={6}>
                    <Text code style={{ fontSize: 12 }}>{v.slice(0, 8)}</Text>
                    {schemaChanged.has(snap.snapshot_date) && (
                      <Tooltip title="The relation's columns changed since the previous snapshot.">
                        <Tag color="orange" style={{ margin: 0 }}>schema changed</Tag>
                      </Tooltip>
                    )}
                  </Space>
                ),
              },
              { title: 'Published', dataIndex: 'published', key: 'published' },
              { title: 'Actions', key: 'actions', width: 260,
                render: (_: unknown, snap: RelationSnapshot) => {
                  const dataUrl = snapshotsClient().getRelationSnapshotDataUrl(schema!, relation, snap.snapshot_date);
                  return (
                    <Space>
                      <Tooltip title="Download Parquet">
                        <Button size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(snap)} />
                      </Tooltip>
                      <Tooltip title="Copy data URL">
                        <Button
                          size="small"
                          icon={<LinkOutlined />}
                          onClick={async () => {
                            await navigator.clipboard.writeText(dataUrl);
                            message.success('URL copied');
                          }}
                        />
                      </Tooltip>
                      <DuckDbPopover dataUrl={dataUrl} />
                    </Space>
                  );
                },
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

/** Expanded row: full metadata for one snapshot date. */
function SnapshotDetails({
  schema,
  relation,
  snap,
  onDownloadFile,
}: {
  schema: string;
  relation: string;
  snap: RelationSnapshot;
  onDownloadFile: (name: string) => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['relation-snapshot', schema, relation, snap.snapshot_date],
    queryFn: async () => await snapshotsClient().getRelationSnapshot(schema, relation, snap.snapshot_date),
    staleTime: 60_000,
  });

  if (isLoading) return <Spin size="small" />;
  if (error) return <Alert type="error" showIcon message={getErrorMessage(error)} />;
  if (!data) return null;

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Descriptions size="small" column={3}>
        <Descriptions.Item label="SRS">{data.srs ?? 'native'}</Descriptions.Item>
        <Descriptions.Item label="CRS">{data.crs ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Snapshot id">
          <Text code style={{ fontSize: 12 }}>{data.snapshot_id}</Text>
        </Descriptions.Item>
      </Descriptions>
      {data.relation_schema && (
        <Table
          dataSource={data.relation_schema}
          rowKey="column_name"
          size="small"
          pagination={false}
          columns={[
            { title: 'Column', dataIndex: 'column_name', key: 'c' },
            { title: 'Type', dataIndex: 'data_type', key: 't' },
          ]}
        />
      )}
      <Space wrap>
        {data.files.map((f) => (
          <Button key={f.name} size="small" icon={<DownloadOutlined />} onClick={() => onDownloadFile(f.name)}>
            {f.name} ({humanBytes(f.size_bytes)})
          </Button>
        ))}
      </Space>
    </Space>
  );
}
