import { Form, Input, InputNumber, Switch, Select, Checkbox, Typography } from 'antd';
import type { FormInstance } from 'antd';

const { Text } = Typography;

export interface JSONSchema {
  type: 'object';
  properties: Record<string, PropertySchema>;
  required?: string[];
}

export interface PropertySchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array';
  title?: string;
  description?: string;
  enum?: string[];
  format?: string;
  minimum?: number;
  maximum?: number;
  items?: { type: string };
}

interface SchemaFormProps {
  schema: JSONSchema;
  form: FormInstance;
  disabled?: boolean;
  /** When provided, renders a checkbox per field. Only checked fields are "enabled". */
  enabledFields?: Record<string, boolean>;
  onEnabledChange?: (fields: Record<string, boolean>) => void;
}

function renderField(key: string, prop: PropertySchema, disabled: boolean) {
  if (prop.enum) {
    return (
      <Select
        allowClear
        disabled={disabled}
        placeholder={`Select ${prop.title ?? key}`}
        options={prop.enum.map((v) => ({ label: v, value: v }))}
      />
    );
  }

  switch (prop.type) {
    case 'string':
      if (prop.format === 'color') {
        return <Input type="color" disabled={disabled} style={{ width: 80, padding: 2, cursor: 'pointer' }} />;
      }
      if (prop.format === 'textarea') {
        return <Input.TextArea rows={3} disabled={disabled} placeholder={prop.title ?? key} />;
      }
      return <Input disabled={disabled} placeholder={prop.title ?? key} />;

    case 'integer':
    case 'number':
      return (
        <InputNumber
          disabled={disabled}
          style={{ width: '100%' }}
          min={prop.minimum}
          max={prop.maximum}
          step={prop.type === 'number' ? 0.1 : 1}
          placeholder={prop.title ?? key}
        />
      );

    case 'boolean':
      return <Switch disabled={disabled} />;

    case 'array':
      if (prop.items?.type === 'string') {
        return <Select mode="tags" disabled={disabled} placeholder={`Add ${prop.title ?? key}`} />;
      }
      return <Input disabled={disabled} placeholder="Unsupported array type" />;

    default:
      return <Input disabled={disabled} placeholder={prop.title ?? key} />;
  }
}

export default function SchemaForm({
  schema,
  form,
  disabled = false,
  enabledFields,
  onEnabledChange,
}: SchemaFormProps) {
  const entries = Object.entries(schema.properties);
  const required = new Set(schema.required ?? []);
  const isBulkMode = !!enabledFields && !!onEnabledChange;

  return (
    <Form form={form} layout="vertical">
      {entries.map(([key, prop]) => {
        const fieldDisabled = disabled || (isBulkMode && !enabledFields![key]);
        const isBool = prop.type === 'boolean';

        const label = isBulkMode ? (
          <Checkbox
            checked={!!enabledFields![key]}
            onChange={(e) =>
              onEnabledChange!({ ...enabledFields!, [key]: e.target.checked })
            }
          >
            {prop.title ?? key}
          </Checkbox>
        ) : (
          prop.title ?? key
        );

        return (
          <Form.Item
            key={key}
            name={key}
            label={label}
            valuePropName={isBool ? 'checked' : 'value'}
            rules={
              !isBulkMode && required.has(key)
                ? [{ required: true, message: `${prop.title ?? key} is required` }]
                : undefined
            }
            help={prop.description ? <Text type="secondary" style={{ fontSize: 12 }}>{prop.description}</Text> : undefined}
          >
            {renderField(key, prop, fieldDisabled)}
          </Form.Item>
        );
      })}
    </Form>
  );
}
