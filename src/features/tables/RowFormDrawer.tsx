import { Drawer, Form, Input, InputNumber, Select, Switch, Button, Typography } from 'antd';
import { message } from '../../utils/message';
import { getSql } from '../../baas/client';

interface Props {
  open: boolean;
  schema: string;
  table: string;
  columns: any[];
  onClose: () => void;
  onDone: () => void;
}

/** Quote an identifier for SQL. */
function qi(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Escape a value for use in a raw SQL literal. */
function sqlLiteral(value: unknown, colType: string): string {
  if (value === null || value === undefined || value === '') return 'NULL';

  const t = colType.toLowerCase();

  if (/^bool(ean)?$/.test(t)) {
    return value === true || value === 'true' ? 'TRUE' : 'FALSE';
  }
  if (/^(smallint|integer|bigint|int[248]?|serial|bigserial|smallserial|oid)$/.test(t)) {
    const n = Number(value);
    if (Number.isNaN(n)) throw new Error(`Invalid integer: ${value}`);
    return String(n);
  }
  if (/^(numeric|decimal|real|float[48]?|double precision|money)$/.test(t)) {
    const n = Number(value);
    if (Number.isNaN(n)) throw new Error(`Invalid number: ${value}`);
    return String(n);
  }
  if (t === 'json' || t === 'jsonb') {
    const s = typeof value === 'string' ? value : JSON.stringify(value);
    JSON.parse(s);
    return `'${s.replace(/'/g, "''")}'::${t}`;
  }

  const s = String(value);
  return `'${s.replace(/'/g, "''")}'`;
}

function isGeoCol(type: string) {
  return /^(geometry|geography)/i.test(type);
}

function isNumericType(type: string) {
  return /^(smallint|integer|bigint|int[248]?|serial|bigserial|smallserial|numeric|decimal|real|float[48]?|double precision|money|oid)$/i.test(type);
}

function isBoolType(type: string) {
  return /^bool(ean)?$/i.test(type);
}

function isJsonType(type: string) {
  return /^json(b)?$/i.test(type);
}

export default function RowFormDrawer({ open, schema, table, columns, onClose, onDone }: Props) {
  const [form] = Form.useForm();

  // Filter out columns that should be skipped entirely
  const editableColumns = columns.filter(
    (col: any) => col.identity_generation !== 'always' && !isGeoCol(col.type),
  );

  const handleSubmit = async () => {
    const values = await form.validateFields();

    const insertCols: string[] = [];
    const insertVals: string[] = [];

    for (const col of editableColumns) {
      const v = values[col.name];
      if (v === null || v === undefined || v === '') continue;
      // Handle boolean switch — Ant Switch gives true/false directly
      if (isBoolType(col.type) && typeof v === 'boolean' && v === false) {
        // explicit false → include it
        insertCols.push(qi(col.name));
        insertVals.push('FALSE');
        continue;
      }
      insertCols.push(qi(col.name));
      insertVals.push(sqlLiteral(v, col.type));
    }

    if (insertCols.length === 0) {
      message.warning('No values provided');
      return;
    }

    try {
      const fqTable = `${qi(schema)}.${qi(table)}`;
      await getSql().exec({
        q: `INSERT INTO ${fqTable} (${insertCols.join(', ')}) VALUES (${insertVals.join(', ')})`,
      });
      message.success('Row inserted');
      form.resetFields();
      onDone();
    } catch (e: any) {
      message.error(e.message ?? String(e));
    }
  };

  const renderInput = (col: any) => {
    const t = col.type.toLowerCase();
    if (isBoolType(t)) {
      return <Switch />;
    }
    if (isNumericType(t)) {
      return <InputNumber style={{ width: '100%' }} />;
    }
    if (isJsonType(t)) {
      return <Input.TextArea rows={3} placeholder="{}" />;
    }
    if (/^(text|varchar)$/i.test(t) || t.startsWith('character')) {
      return <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} />;
    }
    return <Input />;
  };

  return (
    <Drawer
      title="Add Row"
      open={open}
      onClose={onClose}
      width={420}
      extra={<Button type="primary" onClick={handleSubmit}>Save</Button>}
    >
      <Form form={form} layout="vertical">
        {editableColumns.map((col: any) => (
          <Form.Item
            key={col.name}
            name={col.name}
            label={
              <span>
                {col.name}
                <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                  {col.type}
                </Typography.Text>
              </span>
            }
            valuePropName={isBoolType(col.type) ? 'checked' : 'value'}
          >
            {renderInput(col)}
          </Form.Item>
        ))}
        {editableColumns.length === 0 && (
          <Typography.Text type="secondary">No editable columns available.</Typography.Text>
        )}
      </Form>
    </Drawer>
  );
}
