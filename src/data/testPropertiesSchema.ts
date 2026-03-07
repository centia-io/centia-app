import type { JSONSchema } from '../components/SchemaForm';

export const testPropertiesSchema: JSONSchema = {
  type: 'object',
  properties: {
    display_name: {
      type: 'string',
      title: 'Display Name',
      description: 'Human-readable name shown in the UI',
    },
    description: {
      type: 'string',
      title: 'Description',
      format: 'textarea',
      description: 'Longer description of the table purpose',
    },
    icon: {
      type: 'string',
      title: 'Icon',
      enum: ['table', 'map', 'chart', 'file', 'database', 'globe', 'user', 'settings'],
      description: 'Icon to display in navigation',
    },
    color: {
      type: 'string',
      title: 'Color',
      format: 'color',
      description: 'Accent color for the table',
    },
    max_rows: {
      type: 'integer',
      title: 'Max Rows',
      description: 'Maximum number of rows to display per page',
      minimum: 1,
      maximum: 10000,
    },
    opacity: {
      type: 'number',
      title: 'Opacity',
      description: 'Default rendering opacity',
      minimum: 0,
      maximum: 1,
    },
    visible: {
      type: 'boolean',
      title: 'Visible',
      description: 'Whether the table is visible in the UI',
    },
    readonly: {
      type: 'boolean',
      title: 'Read Only',
      description: 'Prevent editing of table data',
    },
    categories: {
      type: 'array',
      title: 'Categories',
      description: 'Classification tags for the table',
      items: { type: 'string' },
    },
    access_level: {
      type: 'string',
      title: 'Access Level',
      enum: ['public', 'internal', 'restricted', 'confidential'],
      description: 'Data classification level',
    },
    refresh_interval: {
      type: 'integer',
      title: 'Refresh Interval (s)',
      description: 'Auto-refresh interval in seconds (0 = disabled)',
      minimum: 0,
    },
  },
  required: ['display_name', 'visible'],
};
