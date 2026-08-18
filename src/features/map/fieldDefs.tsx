import { Fragment } from 'react';
import { ColorPicker, Input, InputNumber, Select, Switch, Typography } from 'antd';

export interface FieldDef {
  key: string;
  label: string;
  input: 'text' | 'number' | 'color' | 'select' | 'switch';
  options?: string[];
}

export function FieldInput({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (def.input) {
    case 'color':
      return (
        <ColorPicker
          size="small"
          allowClear
          value={typeof value === 'string' && value ? value : null}
          onChange={(c) => onChange(c.toHexString())}
          onClear={() => onChange('')}
        />
      );
    case 'number':
      return (
        <InputNumber
          size="small"
          style={{ width: '100%' }}
          value={typeof value === 'string' && value !== '' ? Number(value) : null}
          onChange={(v) => onChange(v === null ? '' : String(v))}
        />
      );
    case 'select':
      return (
        <Select
          size="small"
          style={{ width: '100%' }}
          allowClear
          value={(value as string) || undefined}
          options={(def.options ?? []).map((o) => ({ label: o, value: o }))}
          onChange={(v) => onChange(v ?? '')}
        />
      );
    case 'switch':
      return <Switch size="small" checked={!!value} onChange={(v) => onChange(v)} />;
    default:
      return (
        <Input
          size="small"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

export function FieldGrid({
  fields,
  entity,
  onChange,
}: {
  fields: FieldDef[];
  entity: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '140px 1fr',
        gap: '6px 8px',
        alignItems: 'center',
      }}
    >
      {fields.map((f) => (
        <Fragment key={f.key}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {f.label}
          </Typography.Text>
          <FieldInput def={f} value={entity[f.key]} onChange={(v) => onChange({ [f.key]: v })} />
        </Fragment>
      ))}
    </div>
  );
}

export const STYLE_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', input: 'text' },
  { key: 'color', label: 'Fill color', input: 'color' },
  { key: 'outlinecolor', label: 'Outline color', input: 'color' },
  { key: 'width', label: 'Line width', input: 'number' },
  { key: 'symbol', label: 'Symbol', input: 'text' },
  { key: 'size', label: 'Size', input: 'text' },
  { key: 'angle', label: 'Angle', input: 'text' },
  { key: 'gap', label: 'Gap', input: 'number' },
  { key: 'opacity', label: 'Opacity (0-100)', input: 'number' },
  { key: 'pattern', label: 'Dash pattern', input: 'text' },
  { key: 'linecap', label: 'Line cap', input: 'select', options: ['round', 'butt', 'square'] },
  {
    key: 'geomtransform',
    label: 'Geom transform',
    input: 'select',
    options: ['bbox', 'centroid', 'end', 'labelpnt', 'labelpoly', 'start', 'vertices'],
  },
  { key: 'minsize', label: 'Min size', input: 'number' },
  { key: 'maxsize', label: 'Max size', input: 'number' },
  { key: 'offsetx', label: 'Offset X', input: 'text' },
  { key: 'offsety', label: 'Offset Y', input: 'text' },
  { key: 'polaroffsetr', label: 'Polar offset radius', input: 'text' },
  { key: 'polaroffsetd', label: 'Polar offset angle', input: 'text' },
];

export const LABEL_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', input: 'text' },
  { key: 'on', label: 'Enabled', input: 'switch' },
  { key: 'text', label: 'Text', input: 'text' },
  { key: 'expression', label: 'Expression', input: 'text' },
  { key: 'font', label: 'Font', input: 'text' },
  {
    key: 'fontweight',
    label: 'Font weight',
    input: 'select',
    options: ['normal', 'bold', 'italic', 'bolditalic'],
  },
  { key: 'size', label: 'Size', input: 'text' },
  { key: 'color', label: 'Color', input: 'color' },
  { key: 'outlinecolor', label: 'Outline color', input: 'color' },
  {
    key: 'position',
    label: 'Position',
    input: 'select',
    options: ['auto', 'ul', 'uc', 'ur', 'cl', 'cc', 'cr', 'll', 'lc', 'lr'],
  },
  { key: 'buffer', label: 'Buffer', input: 'number' },
  { key: 'repeatdistance', label: 'Repeat distance', input: 'number' },
  { key: 'angle', label: 'Angle', input: 'text' },
  { key: 'backgroundcolor', label: 'Background color', input: 'color' },
  { key: 'backgroundpadding', label: 'Background padding', input: 'number' },
  { key: 'offsetx', label: 'Offset X', input: 'text' },
  { key: 'offsety', label: 'Offset Y', input: 'text' },
  { key: 'force', label: 'Force placement', input: 'switch' },
  { key: 'minscaledenom', label: 'Min scale denom', input: 'number' },
  { key: 'maxscaledenom', label: 'Max scale denom', input: 'number' },
  { key: 'maxsize', label: 'Max size', input: 'number' },
  { key: 'minfeaturesize', label: 'Min feature size', input: 'text' },
];

export const CLASS_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', input: 'text' },
  { key: 'expression', label: 'Expression', input: 'text' },
  { key: 'minscaledenom', label: 'Min scale denom', input: 'number' },
  { key: 'maxscaledenom', label: 'Max scale denom', input: 'number' },
  { key: 'leader', label: 'Leader line', input: 'switch' },
  { key: 'leader_gridstep', label: 'Leader grid step', input: 'number' },
  { key: 'leader_maxdistance', label: 'Leader max distance', input: 'number' },
  { key: 'leader_color', label: 'Leader color', input: 'color' },
];

export const LAYER_PROP_GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: 'Rendering',
    fields: [
      { key: 'opacity', label: 'Opacity (0-100)', input: 'number' },
      {
        key: 'geotype',
        label: 'Geometry type',
        input: 'select',
        options: ['Default', 'POINT', 'LINE', 'POLYGON'],
      },
      {
        key: 'format',
        label: 'Tile format',
        input: 'select',
        options: ['PNG', 'jpeg_low', 'jpeg_medium', 'jpeg_high'],
      },
      { key: 'offsite', label: 'Offsite color', input: 'color' },
      { key: 'polyline_no_clip', label: 'Polyline no clip', input: 'switch' },
    ],
  },
  {
    title: 'Scale limits',
    fields: [
      { key: 'minscaledenom', label: 'Min scale denom', input: 'number' },
      { key: 'maxscaledenom', label: 'Max scale denom', input: 'number' },
      { key: 'symbolscaledenom', label: 'Symbol scale denom', input: 'number' },
    ],
  },
  {
    title: 'Labels',
    fields: [
      { key: 'label_column', label: 'Label column', input: 'text' },
      { key: 'label_min_scale', label: 'Label min scale', input: 'number' },
      { key: 'label_max_scale', label: 'Label max scale', input: 'number' },
      { key: 'label_no_clip', label: 'Label no clip', input: 'switch' },
    ],
  },
  {
    title: 'Theming & clustering',
    fields: [
      { key: 'theme_column', label: 'Theme column', input: 'text' },
      { key: 'cluster', label: 'Cluster distance', input: 'number' },
    ],
  },
  {
    title: 'Caching & advanced',
    fields: [
      { key: 'meta_tiles', label: 'Meta tiles', input: 'number' },
      { key: 'meta_buffer', label: 'Meta buffer', input: 'number' },
      { key: 'auto_expire', label: 'Auto expire', input: 'number' },
    ],
  },
];
