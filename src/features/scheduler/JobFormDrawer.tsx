import { Button, Checkbox, Drawer, Form, Input, InputNumber, Select, Space, Switch, Typography } from 'antd';
import type { SchedulerJob, SchedulerJobInput, SnapshotFormat } from '@centia-io/sdk';
import { useEffect, useState } from 'react';

const { Text } = Typography;

const GEOMETRY_TYPES = [
  'AUTO', 'POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT', 'MULTILINESTRING', 'MULTIPOLYGON', 'GEOMETRY',
];

const SNAPSHOT_FORMATS: SnapshotFormat[] = ['parquet', 'flatgeobuf'];

const CRON_PRESETS: { label: string; value: string }[] = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Daily at 02:00', value: '0 2 * * *' },
  { label: 'Weekly (Mon 03:00)', value: '0 3 * * 1' },
  { label: 'Monthly (1st 04:00)', value: '0 4 1 * *' },
];

/** 5 whitespace-separated cron fields; the server does the real validation. */
const CRON_SHAPE = /^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/;

/**
 * Mirror of GC2's Model::toAscii(name, null, "_"): transliterate to ASCII,
 * drop everything but letters/digits and \/ _ | + space -, lower-case, trim
 * leading/trailing "-", collapse separator runs to one "_".
 */
export function normalizeJobName(name: string): string {
  return name
    .replace(/[æÆ]/g, 'ae')
    .replace(/[øØ]/g, 'oe')
    .replace(/[åÅ]/g, 'aa')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9/_|+ -]/g, '')
    .toLowerCase()
    .replace(/^-+|-+$/g, '')
    .replace(/[/_|+ -]+/g, '_');
}

export default function JobFormDrawer({
  open,
  job,
  schemas,
  supportsSortby,
  saving,
  onSave,
  onClose,
}: {
  open: boolean;
  /** null = create. */
  job: SchedulerJob | null;
  schemas: string[];
  /** Whether the server knows use_sortby; older servers reject it as an unknown field. */
  supportsSortby: boolean;
  saving: boolean;
  onSave: (values: SchedulerJobInput) => void;
  onClose: () => void;
}) {
  const [form] = Form.useForm();
  const [preset, setPreset] = useState<string | undefined>();
  const nameValue = Form.useWatch('name', form) as string | undefined;
  const snapshotOn = Form.useWatch('snapshot', form) as boolean | undefined;

  useEffect(() => {
    if (!open) return;
    setPreset(undefined);
    if (job) {
      form.setFieldsValue(job);
    } else {
      form.resetFields();
    }
  }, [open, job, form]);

  return (
    <Drawer
      title={job ? `Edit job: ${job.name}` : 'Create job'}
      open={open}
      onClose={onClose}
      width={560}
      extra={
        <Button
          type="primary"
          loading={saving}
          onClick={async () => {
            const values = (await form.validateFields()) as SchedulerJobInput;
            // Empty selection means "server default" — the wire value is null, never [].
            values.snapshot_formats = values.snapshot_formats?.length ? values.snapshot_formats : null;
            if (!supportsSortby) delete (values as { use_sortby?: boolean }).use_sortby;
            onSave(values);
          }}
        >
          Save
        </Button>
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          epsg: 4326,
          type: 'AUTO',
          encoding: 'UTF8',
          delete_append: false,
          download_schema: true,
          active: true,
          snapshot: false,
          use_sortby: true,
        }}
      >
        <Form.Item
          name="name"
          label="Name"
          rules={[{ required: true }]}
          extra={
            nameValue && normalizeJobName(nameValue) !== nameValue ? (
              <>Will be stored as <Text code>{normalizeJobName(nameValue)}</Text> (the import table is named after the job).</>
            ) : undefined
          }
        >
          <Input />
        </Form.Item>
        <Form.Item name="schema" label="Target schema" rules={[{ required: true }]}>
          <Select showSearch options={schemas.map((s) => ({ label: s, value: s }))} />
        </Form.Item>
        <Form.Item
          name="url"
          label="Source URL"
          rules={[{ required: true }]}
          extra="File or service to import (anything ogr2ogr can read)."
        >
          <Input placeholder="https://example.com/data.geojson" />
        </Form.Item>
        <Form.Item label="Schedule" required style={{ marginBottom: 0 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Select
              placeholder="Preset"
              style={{ width: 200 }}
              allowClear
              value={preset}
              options={CRON_PRESETS}
              onChange={(v) => {
                setPreset(v);
                if (v) form.setFieldsValue({ schedule: v });
              }}
            />
            <Form.Item
              name="schedule"
              noStyle
              rules={[
                { required: true, message: 'Schedule is required' },
                { pattern: CRON_SHAPE, message: 'Five cron fields, e.g. 0 3 * * *' },
              ]}
            >
              <Input placeholder="0 3 * * *" onChange={() => setPreset(undefined)} />
            </Form.Item>
          </Space.Compact>
          <Text type="secondary" style={{ fontSize: 12 }}>
            5-field cron: minute hour day-of-month month day-of-week.
          </Text>
        </Form.Item>
        <Space style={{ marginTop: 16 }} wrap>
          <Form.Item name="epsg" label="EPSG">
            <InputNumber min={1} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="type" label="Geometry type">
            <Select style={{ width: 180 }} options={GEOMETRY_TYPES.map((t) => ({ label: t, value: t }))} />
          </Form.Item>
          <Form.Item name="encoding" label="Encoding">
            <Select style={{ width: 120 }} options={['UTF8', 'LATIN1'].map((e) => ({ label: e, value: e }))} />
          </Form.Item>
        </Space>
        <Space wrap size="large">
          <Form.Item
            name="delete_append"
            label="Append"
            valuePropName="checked"
            tooltip="Append to the table instead of overwriting it."
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="download_schema"
            label="Download schema"
            valuePropName="checked"
            tooltip="Let the import derive the table schema from the source."
          >
            <Switch />
          </Form.Item>
          {supportsSortby && (
            <Form.Item
              name="use_sortby"
              label="Sort pages (sortBy)"
              valuePropName="checked"
              tooltip="Paged WFS 2.0.0 imports add a sortBy so pages neither overlap nor skip rows. Turn off for servers that reject sortBy. Has no effect on other sources."
            >
              <Switch />
            </Form.Item>
          )}
          <Form.Item name="active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            name="snapshot"
            label="Snapshot"
            valuePropName="checked"
            tooltip="Queue a snapshot after each successful import (see Tools → Snapshots)."
          >
            <Switch />
          </Form.Item>
          {snapshotOn && (
            <Form.Item
              name="snapshot_formats"
              label="Snapshot formats"
              tooltip="Formats for the queued snapshot. None selected = the server default."
            >
              <Checkbox.Group options={SNAPSHOT_FORMATS.map((f) => ({ label: f, value: f }))} />
            </Form.Item>
          )}
        </Space>
        <Form.Item name="presql" label="Pre-SQL" extra="Runs before the import.">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="postsql" label="Post-SQL" extra="Runs after a successful import.">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="extra" label="Extra ogr2ogr arguments">
          <Input placeholder="-nlt PROMOTE_TO_MULTI …" />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
