import { useEffect, useMemo, useState } from 'react';
import {
  Alert, AutoComplete, Button, Card, Checkbox, Descriptions, Drawer, Form, Input, InputNumber, Popconfirm,
  Select, Slider, Space, Table, Tag, Tooltip, Typography,
} from 'antd';
import { ReloadOutlined, RocketOutlined, StopOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Tileseeder } from '@centia-io/sdk';
import type { SeedJob, SeedJobInput, SeedJobStatus } from '@centia-io/sdk';
import { message } from '../../utils/message';
import { getAdminClient, getApiErrorCode, getErrorMessage } from '../../baas/adminClient';
import { useAuth } from '../../auth/AuthProvider';
import { queryClient } from '../../data/queryClient';
import {
  isWebMercatorPyramid, tilesInBBox, useEstimatedExtent, useSeedCapabilities, type SeedGrid,
} from './capabilities';

const { Text } = Typography;

function seeder() {
  return new Tileseeder(getAdminClient().http);
}

const STATUS_COLOR: Record<SeedJobStatus, string> = {
  pending: 'default',
  running: 'processing',
  succeeded: 'success',
  failed: 'error',
  cancelled: 'warning',
};
const STATUSES: SeedJobStatus[] = ['pending', 'running', 'succeeded', 'failed', 'cancelled'];
const isActive = (j: SeedJob) => j.status === 'pending' || j.status === 'running';

/** Seeding beyond this many tiles can run for hours. */
const LARGE_SEED = 1_000_000;

/** Tiles in the whole grid over the zoom range — an upper bound; an extent layer seeds fewer. */
function tileUpperBound(grid: SeedGrid | undefined, from: number, to: number): number {
  if (!grid) return 0;
  return grid.levels.reduce((sum, z, i) => (z >= from && z <= to ? sum + grid.tilesPerLevel[i] : sum), 0);
}

/** "urn:ogc:def:crs:EPSG:6.3:3857" -> "EPSG:3857". */
function crsLabel(crs: string | null | undefined): string | null {
  const code = crs?.match(/EPSG:(?:[\d.]*:)?(\d+)$/)?.[1];
  return code ? `EPSG:${code}` : (crs ?? null);
}

function JobStatus({ job }: { job: SeedJob }) {
  if (!job.status) return <Text type="secondary">—</Text>;
  return (
    <Space size={4}>
      <Tag color={STATUS_COLOR[job.status]} style={{ margin: 0 }}>{job.status}</Tag>
      {job.stale && (
        <Tooltip title="Running, but no heartbeat for 10 minutes: the run or its node is gone.">
          <Tag color="orange" style={{ margin: 0 }}>stale</Tag>
        </Tooltip>
      )}
    </Space>
  );
}

/**
 * mapcache_seed redraws its progress line with carriage returns; keep only
 * what a terminal would show — the last text written on each line.
 */
function terminalText(log: string): string {
  return log
    .split('\n')
    .map((line) => line.split('\r').map((seg) => seg.trimEnd()).filter(Boolean).pop() ?? '')
    .join('\n')
    .trimEnd();
}

function errorText(e: unknown): string {
  const code = getApiErrorCode(e);
  return code ? `${code}: ${getErrorMessage(e)}` : getErrorMessage(e);
}

export default function TileSeederPage() {
  const { user } = useAuth();
  const database = (user?.database as string) ?? '';
  const [form] = Form.useForm();
  const [includeVector, setIncludeVector] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SeedJobStatus | undefined>();
  const [search, setSearch] = useState('');
  const [detailUuid, setDetailUuid] = useState<string | null>(null);

  const caps = useSeedCapabilities(database);
  const tilesetId = Form.useWatch('tileset', form) as string | undefined;
  const gridId = Form.useWatch('grid', form) as string | undefined;
  const zoom = Form.useWatch('zoom', form) as [number, number] | undefined;
  const extentLayer = Form.useWatch('extent_layer', form) as string | undefined;

  const tileset = caps.data?.tilesets.find((t) => t.id === tilesetId);
  const grid = gridId ? caps.data?.grids[gridId] : undefined;
  const minZoom = grid?.levels[0] ?? 0;
  const maxZoom = grid?.levels[grid.levels.length - 1] ?? 0;

  // A tileset's grid list decides the grid; the grid's levels decide the zoom range.
  useEffect(() => {
    form.setFieldsValue({ grid: tileset?.grids.length === 1 ? tileset.grids[0] : undefined });
  }, [tileset, form]);
  useEffect(() => {
    if (grid) form.setFieldsValue({ zoom: [minZoom, Math.min(maxZoom, minZoom + 12)] });
  }, [grid, minZoom, maxZoom, form]);

  const jobsQuery = useQuery({
    queryKey: ['seed-jobs', statusFilter],
    queryFn: async () => await seeder().getSeedJobs(statusFilter ? { status: statusFilter } : undefined),
    refetchInterval: (q) => ((q.state.data ?? []).some(isActive) ? 3000 : false),
  });
  const jobs = (jobsQuery.data ?? []).filter((j) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return [j.name, j.tileset, j.username].some((v) => (v ?? '').toLowerCase().includes(s));
  });

  const detailQuery = useQuery({
    queryKey: ['seed-job', detailUuid],
    queryFn: async () => await seeder().getSeedJob(detailUuid!),
    enabled: !!detailUuid,
    refetchInterval: (q) => (q.state.data && isActive(q.state.data) ? 3000 : false),
  });
  const detail = detailQuery.data ?? jobsQuery.data?.find((j) => j.uuid === detailUuid) ?? null;

  const extentBBox = useEstimatedExtent(extentLayer || undefined).data ?? null;
  const zFrom = zoom?.[0] ?? 0;
  const zTo = zoom?.[1] ?? -1;
  // Within the extent layer's bbox when we can work it out, else the whole grid.
  const inExtent = grid && extentLayer && extentBBox && isWebMercatorPyramid(grid) ? tilesInBBox(extentBBox, zFrom, zTo) : null;
  const tileCount = inExtent ?? tileUpperBound(grid, zFrom, zTo);

  const tilesetOptions = useMemo(
    () =>
      (caps.data?.tilesets ?? [])
        .filter((t) => includeVector || !t.vector)
        .map((t) => ({ label: t.id, value: t.id })),
    [caps.data, includeVector],
  );

  const handleSubmit = async () => {
    const v = await form.validateFields();
    const body: SeedJobInput = {
      tileset: v.tileset,
      grid: v.grid,
      zoom_start: v.zoom[0],
      zoom_end: v.zoom[1],
    };
    if (v.name) body.name = v.name;
    if (v.extent_layer) body.extent_layer = v.extent_layer;
    if (v.threads) body.threads = v.threads;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await seeder().postSeedJob(body);
      message.success('Seed job queued. The server picks it up within a minute.');
      queryClient.invalidateQueries({ queryKey: ['seed-jobs'] });
    } catch (e) {
      // Kept on screen: the message names e.g. the grids the tileset actually has.
      setSubmitError(errorText(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStop = async (job: SeedJob) => {
    try {
      const stopping = await seeder().deleteSeedJob(job.uuid);
      message.info(stopping ? 'Stop requested. The worker stops the job shortly.' : 'Seed job cancelled.');
      queryClient.invalidateQueries({ queryKey: ['seed-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['seed-job', job.uuid] });
    } catch (e) {
      message.error(errorText(e));
    }
  };

  const stopButton = (job: SeedJob) =>
    isActive(job) && !job.cancel_requested ? (
      <Popconfirm title="Stop this seed job?" okText="Stop" onConfirm={() => handleStop(job)}>
        <Button size="small" danger icon={<StopOutlined />}>Stop</Button>
      </Popconfirm>
    ) : job.cancel_requested && isActive(job) ? (
      <Text type="secondary">Stopping…</Text>
    ) : null;

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <h2>Tile Seeder</h2>
      </Space>

      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message="Seeding pre-renders a tileset's tiles into the cache. Jobs are queued and picked up by the server within a minute, so 'pending' is normal until then."
      />

      <Card title="New seed job" size="small" style={{ marginBottom: 16 }}>
        {caps.error ? (
          <Alert type="error" showIcon message={`Could not load the tilesets: ${getErrorMessage(caps.error)}`} />
        ) : (
          <Form form={form} layout="vertical" style={{ maxWidth: 720 }}>
            <Form.Item
              label="Tileset"
              required
              extra={
                <Checkbox checked={includeVector} onChange={(e) => setIncludeVector(e.target.checked)}>
                  Include vector tilesets (.mvt / .json)
                </Checkbox>
              }
            >
              <Form.Item name="tileset" noStyle rules={[{ required: true, message: 'Choose a tileset' }]}>
                <Select
                  showSearch
                  loading={caps.isLoading}
                  placeholder="schema.table"
                  options={tilesetOptions}
                  onChange={(t: string) =>
                    form.setFieldsValue({ extent_layer: t.replace(/\.(mvt|json)$/, '') })
                  }
                />
              </Form.Item>
            </Form.Item>
            <Space wrap align="start" size="large">
              <Form.Item
                name="grid"
                label="Grid"
                rules={[{ required: true, message: 'Choose a grid' }]}
                tooltip="Only the grids this tileset declares."
              >
                <Select
                  style={{ width: 200 }}
                  disabled={!tileset}
                  options={(tileset?.grids ?? []).map((g) => ({
                    label: crsLabel(caps.data?.grids[g]?.crs) ? `${g} (${crsLabel(caps.data?.grids[g]?.crs)})` : g,
                    value: g,
                  }))}
                />
              </Form.Item>
              <Form.Item name="threads" label="Threads" tooltip="Optional; the server default when empty.">
                <InputNumber min={1} max={64} style={{ width: 120 }} />
              </Form.Item>
              <Form.Item name="name" label="Name" tooltip="Optional label; defaults to the tileset.">
                <Input style={{ width: 240 }} maxLength={255} />
              </Form.Item>
            </Space>
            <Form.Item
              name="zoom"
              label={zoom ? `Zoom levels ${zoom[0]}–${zoom[1]}` : 'Zoom levels'}
              rules={[{ required: true, message: 'Choose a zoom range' }]}
            >
              <Slider
                range
                disabled={!grid}
                min={minZoom}
                max={maxZoom}
                marks={grid ? { [minZoom]: String(minZoom), [maxZoom]: String(maxZoom) } : undefined}
              />
            </Form.Item>
            <Form.Item
              name="extent_layer"
              label="Extent layer"
              tooltip="Seed only within this layer's extent. Must be a registered layer you can read. Leave empty to seed the whole grid."
            >
              <AutoComplete
                allowClear
                placeholder="schema.table"
                options={tileset ? [{ value: tileset.id.replace(/\.(mvt|json)$/, '') }] : []}
              />
            </Form.Item>
            {grid && zoom && (
              <Alert
                style={{ marginBottom: 16 }}
                type={tileCount > LARGE_SEED ? 'warning' : 'info'}
                showIcon
                message={
                  <>
                    {inExtent !== null ? (
                      <>
                        About <Text strong>{inExtent.toLocaleString()}</Text> tiles within the bounding box of{' '}
                        {extentLayer} at zoom {zFrom}–{zTo} (from the table statistics).
                      </>
                    ) : (
                      <>
                        Up to <Text strong>{tileCount.toLocaleString()}</Text> tiles for the whole grid at zoom {zFrom}–{zTo}
                        {extentLayer ? '; the extent layer limits the actual number' : ''}.
                      </>
                    )}
                    {tileCount > LARGE_SEED && ' Each extra zoom level quadruples the work, so this can run for hours.'}
                  </>
                }
              />
            )}
            {submitError && (
              <Alert
                style={{ marginBottom: 16 }}
                type="error"
                showIcon
                closable
                onClose={() => setSubmitError(null)}
                message={submitError}
              />
            )}
            <Button type="primary" icon={<RocketOutlined />} loading={submitting} onClick={handleSubmit}>
              Queue seed job
            </Button>
          </Form>
        )}
      </Card>

      <Card
        title="Seed jobs"
        size="small"
        extra={
          <Space>
            <Select
              allowClear
              placeholder="All statuses"
              style={{ width: 150 }}
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUSES.map((s) => ({ label: s, value: s }))}
            />
            <Input.Search allowClear placeholder="Search name, tileset, user" onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} />
            <Button icon={<ReloadOutlined />} onClick={() => jobsQuery.refetch()}>Refresh</Button>
          </Space>
        }
      >
        {jobsQuery.error ? (
          <Alert type="error" showIcon message={getErrorMessage(jobsQuery.error)} />
        ) : (
          <Table
            dataSource={jobs}
            rowKey="uuid"
            size="small"
            loading={jobsQuery.isLoading}
            pagination={{ pageSize: 25, hideOnSinglePage: true }}
            locale={{ emptyText: 'No seed jobs yet.' }}
            columns={[
              { title: 'Status', key: 'status', render: (_: unknown, j: SeedJob) => <JobStatus job={j} /> },
              { title: 'Name', dataIndex: 'name', key: 'name' },
              { title: 'Tileset', dataIndex: 'tileset', key: 'tileset', render: (v: string | null) => v ?? '—' },
              { title: 'Grid', dataIndex: 'grid', key: 'grid', render: (v: string | null) => v ?? '—' },
              {
                title: 'Zoom', key: 'zoom',
                render: (_: unknown, j: SeedJob) => (j.zoom_start !== null ? `${j.zoom_start}–${j.zoom_end}` : '—'),
              },
              { title: 'Extent', dataIndex: 'extent_layer', key: 'extent', render: (v: string | null) => v ?? '—' },
              { title: 'User', dataIndex: 'username', key: 'user', render: (v: string | null) => v ?? '—' },
              { title: 'Created', dataIndex: 'created', key: 'created' },
              { title: 'Finished', dataIndex: 'finished', key: 'finished', render: (v: string | null) => v ?? '—' },
              {
                title: 'Actions', key: 'actions', width: 170,
                render: (_: unknown, j: SeedJob) => (
                  <Space>
                    <Button size="small" onClick={() => setDetailUuid(j.uuid)}>Details</Button>
                    {stopButton(j)}
                  </Space>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Drawer
        title={detail ? `Seed job: ${detail.name}` : 'Seed job'}
        open={!!detailUuid}
        onClose={() => setDetailUuid(null)}
        width={640}
        extra={detail ? stopButton(detail) : null}
      >
        {detail && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="Status" span={2}><JobStatus job={detail} /></Descriptions.Item>
              <Descriptions.Item label="Tileset">{detail.tileset ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Grid">{detail.grid ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Zoom">
                {detail.zoom_start !== null ? `${detail.zoom_start}–${detail.zoom_end}` : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Threads">{detail.threads ?? 'default'}</Descriptions.Item>
              <Descriptions.Item label="Extent layer" span={2}>{detail.extent_layer ?? 'whole grid'}</Descriptions.Item>
              <Descriptions.Item label="Created">{detail.created}</Descriptions.Item>
              <Descriptions.Item label="Started">{detail.started ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Heartbeat">{detail.heartbeat ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Finished">{detail.finished ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Host / pid" span={2}>
                {detail.host ? `${detail.host} / ${detail.pid ?? '—'}` : '—'}
              </Descriptions.Item>
              {detail.cancel_requested && (
                <Descriptions.Item label="Stop requested" span={2}>{detail.cancel_requested}</Descriptions.Item>
              )}
              <Descriptions.Item label="User" span={2}>{detail.username ?? '—'}</Descriptions.Item>
            </Descriptions>
            {detail.status === 'pending' && (
              <Alert type="info" showIcon message="Waiting for the server to pick up the job (within a minute)." />
            )}
            {detail.error && <Alert type="error" showIcon message={detail.error} />}
            <Text strong>Log</Text>
            {detailQuery.isLoading ? (
              <Text type="secondary">Loading…</Text>
            ) : detail.log ? (
              <pre
                style={{
                  fontSize: 12, maxHeight: 360, overflow: 'auto', margin: 0, whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all', fontFamily: 'monospace',
                }}
              >
                {terminalText(detail.log)}
              </pre>
            ) : (
              <Text type="secondary">No output yet.</Text>
            )}
          </Space>
        )}
      </Drawer>
    </div>
  );
}
