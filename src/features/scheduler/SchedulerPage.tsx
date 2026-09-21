import { useState } from 'react';
import {
  Alert, Button, Descriptions, Drawer, Input, Select, Space, Table, Tabs, Tag, Tooltip, Typography,
} from 'antd';
import {
  CaretRightOutlined, DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, StopOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Scheduler } from '@centia-io/sdk';
import type { SchedulerJob, SchedulerJobInput, SchedulerRun, SchedulerRunStatus } from '@centia-io/sdk';
import { message } from '../../utils/message';
import { getAdminClient, getApiErrorCode, getErrorMessage } from '../../baas/adminClient';
import { useAuth } from '../../auth/AuthProvider';
import { confirmDelete } from '../../components/ConfirmDelete';
import { queryClient } from '../../data/queryClient';
import JobFormDrawer from './JobFormDrawer';

const { Text } = Typography;

function schedulerClient() {
  return new Scheduler(getAdminClient().http);
}

const RUN_STATUS_COLOR: Record<SchedulerRunStatus, string> = {
  running: 'processing',
  succeeded: 'success',
  failed: 'error',
  skipped: 'default',
  lost: 'warning',
};

const RUN_STATUSES: SchedulerRunStatus[] = ['running', 'succeeded', 'failed', 'skipped', 'lost'];

export default function SchedulerPage() {
  const { user } = useAuth();
  const isSuperUser = user?.superUser === true;

  const [selectedJobIds, setSelectedJobIds] = useState<number[]>([]);
  const [jobSearch, setJobSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editJob, setEditJob] = useState<SchedulerJob | null>(null);
  const [saving, setSaving] = useState(false);
  const [runJobFilter, setRunJobFilter] = useState<number | null>(null);
  const [runStatusFilter, setRunStatusFilter] = useState<SchedulerRunStatus | null>(null);
  const [detailRun, setDetailRun] = useState<SchedulerRun | null>(null);
  const [stopping, setStopping] = useState<string | null>(null);
  /** Keep the runs panel polling for a while after a manual start (the run may not exist yet). */
  const [pollUntil, setPollUntil] = useState(0);

  const { data: schemas = [] } = useQuery({
    queryKey: ['schema-names'],
    queryFn: async () =>
      (await getAdminClient().provisioning.schemas.getSchema(undefined, { namesOnly: true })).map((s) => s.name),
    staleTime: 30_000,
    enabled: isSuperUser,
  });

  const jobsQuery = useQuery({
    queryKey: ['scheduler-jobs'],
    queryFn: async () => await schedulerClient().getSchedulerJobs(),
    enabled: isSuperUser,
    staleTime: 10_000,
  });
  const jobs = jobsQuery.data ?? [];
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  // Legacy rows can carry null name/url despite the declared types — stay null-safe.
  const visibleJobs = jobSearch
    ? jobs.filter((j) =>
        [j.name, j.schema, j.url, String(j.id)].some((v) =>
          (v ?? '').toLowerCase().includes(jobSearch.toLowerCase()),
        ),
      )
    : jobs;

  const runsQuery = useQuery({
    queryKey: ['scheduler-runs', runJobFilter, runStatusFilter],
    queryFn: async () =>
      await schedulerClient().getSchedulerRuns({
        job: runJobFilter ?? undefined,
        status: runStatusFilter ?? undefined,
      }),
    enabled: isSuperUser,
    refetchInterval: (q) => {
      const active = (q.state.data ?? []).some((r: SchedulerRun) => r.status === 'running');
      return active || Date.now() < pollUntil ? 5000 : false;
    },
  });
  const runs = runsQuery.data ?? [];
  const anyRunning = runs.some((r) => r.status === 'running');

  if (!isSuperUser) {
    return <Alert type="info" showIcon message="The scheduler is available to the database super-user only." />;
  }

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['scheduler-jobs'] });
    queryClient.invalidateQueries({ queryKey: ['scheduler-runs'] });
  };

  const handleSave = async (values: SchedulerJobInput) => {
    setSaving(true);
    try {
      if (editJob) {
        await schedulerClient().patchSchedulerJob(editJob.id, values);
        message.success('Job updated');
      } else {
        await schedulerClient().postSchedulerJob(values);
        message.success('Job created');
      }
      setFormOpen(false);
      setEditJob(null);
      queryClient.invalidateQueries({ queryKey: ['scheduler-jobs'] });
    } catch (e) {
      if (getApiErrorCode(e) === 'INVALID_CRON_FIELD') {
        message.error(`Invalid cron expression: ${getErrorMessage(e)}`);
      } else {
        message.error(getErrorMessage(e));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (ids: number[]) => {
    const names = ids.map((id) => jobById.get(id)?.name ?? id).join(', ');
    confirmDelete(names, async () => {
      try {
        await schedulerClient().deleteSchedulerJob(ids.length === 1 ? ids[0] : ids);
        message.success(ids.length === 1 ? 'Job deleted' : `${ids.length} jobs deleted`);
        setSelectedJobIds([]);
        queryClient.invalidateQueries({ queryKey: ['scheduler-jobs'] });
      } catch (e) {
        if (getApiErrorCode(e) === 'JOB_RUNNING') {
          message.warning('A selected job has a run in progress — nothing was deleted.');
        } else {
          message.error(getErrorMessage(e));
        }
      }
    });
  };

  const handleRunNow = async (job: SchedulerJob) => {
    try {
      await schedulerClient().postSchedulerRun({ job: job.id });
      message.success(`Started "${job.name}"`);
      setPollUntil(Date.now() + 30_000);
      queryClient.invalidateQueries({ queryKey: ['scheduler-runs'] });
    } catch (e) {
      if (getApiErrorCode(e) === 'JOB_RUNNING') {
        message.warning('This job already has a run in progress.');
      } else {
        message.error(getErrorMessage(e));
      }
    }
  };

  const handleStop = (run: SchedulerRun) => {
    confirmDelete(`run ${run.uuid.slice(0, 8)} (SIGINT, then SIGKILL — may take up to 30 s)`, async () => {
      setStopping(run.uuid);
      try {
        const res = await schedulerClient().deleteSchedulerRun(run.uuid);
        message.success(`Run stopped (${res.signal})`);
      } catch (e) {
        message.error(getErrorMessage(e));
      } finally {
        setStopping(null);
        refreshAll();
      }
    });
  };

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <h2>Scheduler</h2>
      </Space>

      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message="Scheduler jobs import a file or service into a schema on a cron schedule (via ogr2ogr). A job can optionally queue a Parquet snapshot after each successful import."
      />

      <Tabs
        defaultActiveKey="jobs"
        tabBarExtraContent={
          <Button size="small" icon={<ReloadOutlined />} onClick={refreshAll}>
            Refresh
          </Button>
        }
        items={[
          { key: 'jobs',
            label: `Jobs (${jobs.length})`,
            children: (
              <>
                <Space style={{ marginBottom: 12, justifyContent: 'space-between', width: '100%' }}>
                  <Input.Search
                    placeholder="Search name, schema or URL..."
                    allowClear
                    onChange={(e) => setJobSearch(e.target.value)}
                    style={{ width: 320 }}
                  />
                  <Space>
                    {selectedJobIds.length > 0 && (
                      <Button danger icon={<DeleteOutlined />} onClick={() => handleDelete(selectedJobIds)}>
                        Delete selected ({selectedJobIds.length})
                      </Button>
                    )}
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => {
                        setEditJob(null);
                        setFormOpen(true);
                      }}
                    >
                      New job
                    </Button>
                  </Space>
                </Space>
                <Table
          dataSource={visibleJobs}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 25, showSizeChanger: true }}
          loading={jobsQuery.isLoading}
          rowSelection={{
            selectedRowKeys: selectedJobIds,
            onChange: (keys) => setSelectedJobIds(keys as number[]),
          }}
          locale={{ emptyText: 'No scheduler jobs yet.' }}
          columns={[
            { title: 'Id', dataIndex: 'id', key: 'id', width: 80,
              sorter: (a: SchedulerJob, b: SchedulerJob) => a.id - b.id,
            },
            { title: 'Name', dataIndex: 'name', key: 'name',
              sorter: (a: SchedulerJob, b: SchedulerJob) => (a.name ?? '').localeCompare(b.name ?? ''),
            },
            { title: 'Schema', dataIndex: 'schema', key: 'schema',
              sorter: (a: SchedulerJob, b: SchedulerJob) => (a.schema ?? '').localeCompare(b.schema ?? ''),
            },
            { title: 'URL', dataIndex: 'url', key: 'url', ellipsis: true,
              sorter: (a: SchedulerJob, b: SchedulerJob) => (a.url ?? '').localeCompare(b.url ?? ''),
              render: (v: string) => <Tooltip title={v}>{v}</Tooltip>,
            },
            { title: 'Schedule', dataIndex: 'schedule', key: 'schedule',
              sorter: (a: SchedulerJob, b: SchedulerJob) => (a.schedule ?? '').localeCompare(b.schedule ?? ''),
              render: (v: string) => <Text code>{v}</Text>,
            },
            { title: 'Active', dataIndex: 'active', key: 'active',
              sorter: (a: SchedulerJob, b: SchedulerJob) => Number(a.active) - Number(b.active),
              render: (v: boolean) => (v ? <Tag color="green">active</Tag> : <Tag>inactive</Tag>),
            },
            { title: 'Snapshot', dataIndex: 'snapshot', key: 'snapshot',
              sorter: (a: SchedulerJob, b: SchedulerJob) => Number(a.snapshot) - Number(b.snapshot),
              render: (v: boolean) => (v ? <Tag color="blue">yes</Tag> : null),
            },
            { title: 'Last run', key: 'lastrun',
              // ok/failed first by status, then newest run; never-run rows sort last.
              sorter: (a: SchedulerJob, b: SchedulerJob) =>
                (a.lastrun ?? '').localeCompare(b.lastrun ?? ''),
              render: (_: unknown, j: SchedulerJob) =>
                j.lastcheck === null ? (
                  <Text type="secondary">never</Text>
                ) : (
                  <Space size={6}>
                    <Tag color={j.lastcheck ? 'success' : 'error'} style={{ margin: 0 }}>
                      {j.lastcheck ? 'ok' : 'failed'}
                    </Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>{j.lastrun ?? ''}</Text>
                  </Space>
                ),
            },
            { title: 'Actions', key: 'actions', width: 140,
              render: (_: unknown, j: SchedulerJob) => (
                <Space>
                  <Tooltip title="Run now">
                    <Button size="small" icon={<CaretRightOutlined />} onClick={() => handleRunNow(j)} />
                  </Tooltip>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setEditJob(j);
                      setFormOpen(true);
                    }}
                  />
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete([j.id])} />
                </Space>
              ),
            },
          ]}
        />
              </>
            ),
          },
          { key: 'runs',
            label: (
              <Space size={6}>
                Runs
                {anyRunning && <Tag color="processing" style={{ margin: 0 }}>live</Tag>}
              </Space>
            ),
            children: (
              <>
                <Space style={{ marginBottom: 12 }}>
            <Select
              placeholder="All jobs"
              style={{ width: 240 }}
              size="small"
              allowClear
              value={runJobFilter}
              onChange={(v) => setRunJobFilter(v ?? null)}
              options={jobs.map((j) => ({ label: j.name, value: j.id }))}
            />
            <Select
              placeholder="All statuses"
              style={{ width: 140 }}
              size="small"
              allowClear
              value={runStatusFilter}
              onChange={(v) => setRunStatusFilter(v ?? null)}
              options={RUN_STATUSES.map((s) => ({ label: s, value: s }))}
            />
                </Space>
                <Table
          dataSource={runs}
          rowKey="uuid"
          size="small"
          pagination={{ pageSize: 25 }}
          loading={runsQuery.isLoading}
          locale={{ emptyText: 'No runs.' }}
          columns={[
            { title: 'Job', key: 'job',
              render: (_: unknown, r: SchedulerRun) => jobById.get(r.job)?.name ?? `#${r.job}`,
            },
            { title: 'Status', key: 'status',
              render: (_: unknown, r: SchedulerRun) => (
                <Space size={4}>
                  <Tag color={RUN_STATUS_COLOR[r.status]} style={{ margin: 0 }}>{r.status}</Tag>
                  {r.stale && (
                    <Tooltip title="Running, but no progress signal for 5 minutes.">
                      <Tag color="orange" style={{ margin: 0 }}>stale</Tag>
                    </Tooltip>
                  )}
                </Space>
              ),
            },
            { title: 'Started', dataIndex: 'started_at', key: 'started' },
            { title: 'Finished', dataIndex: 'finished_at', key: 'finished',
              render: (v: string | null) => v ?? '—',
            },
            { title: 'Started by', dataIndex: 'name', key: 'by',
              render: (v: string | null) => v ?? '—',
            },
            { title: 'Actions', key: 'actions', width: 120,
              render: (_: unknown, r: SchedulerRun) => (
                <Space>
                  <Button size="small" onClick={() => setDetailRun(r)}>
                    Details
                  </Button>
                  {r.status === 'running' && (
                    <Tooltip title="Stop run">
                      <Button
                        size="small"
                        danger
                        icon={<StopOutlined />}
                        loading={stopping === r.uuid}
                        onClick={() => handleStop(r)}
                      />
                    </Tooltip>
                  )}
                </Space>
              ),
            },
          ]}
        />
              </>
            ),
          },
        ]}
      />

      <JobFormDrawer
        open={formOpen}
        job={editJob}
        schemas={schemas}
        saving={saving}
        onSave={handleSave}
        onClose={() => {
          setFormOpen(false);
          setEditJob(null);
        }}
      />

      <Drawer
        title={detailRun ? `Run ${detailRun.uuid.slice(0, 8)}` : ''}
        open={detailRun !== null}
        onClose={() => setDetailRun(null)}
        width={560}
      >
        {detailRun && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="Job">{jobById.get(detailRun.job)?.name ?? `#${detailRun.job}`}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={RUN_STATUS_COLOR[detailRun.status]}>{detailRun.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Started">{detailRun.started_at}</Descriptions.Item>
              <Descriptions.Item label="Finished">{detailRun.finished_at ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Heartbeat">{detailRun.heartbeat ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Host / pid">{`${detailRun.host ?? '—'} / ${detailRun.pid}`}</Descriptions.Item>
              <Descriptions.Item label="Started by" span={2}>{detailRun.name ?? '—'}</Descriptions.Item>
            </Descriptions>
            {detailRun.exit_reason && (
              <Alert type={detailRun.status === 'failed' ? 'error' : 'info'} showIcon message={detailRun.exit_reason} />
            )}
            {jobById.get(detailRun.job)?.report && (
              <>
                <Text strong>Last report for this job</Text>
                <pre style={{ fontSize: 12, maxHeight: 320, overflow: 'auto', margin: 0 }}>
                  {JSON.stringify(jobById.get(detailRun.job)!.report, null, 2)}
                </pre>
              </>
            )}
          </Space>
        )}
      </Drawer>
    </div>
  );
}

