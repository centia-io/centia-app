import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Table, Button, Space, Alert, Form, Input, InputNumber, Select, message, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SaveOutlined, CloseOutlined, ReloadOutlined } from '@ant-design/icons';
import { getSql } from '../../baas/client';
import { confirmDelete } from '../../components/ConfirmDelete';
import RowFormDrawer from './RowFormDrawer';

interface Props {
  schema: string;
  table: string;
  columns: any[];
  constraints: any[];
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250];

/** Escape a value for use in a raw SQL literal. */
function sqlLiteral(value: unknown, colType: string): string {
  if (value === null || value === undefined || value === '') return 'NULL';

  const t = colType.toLowerCase();

  // Boolean
  if (t === 'boolean' || t === 'bool') {
    return value === true || value === 'true' ? 'TRUE' : 'FALSE';
  }

  // Numeric types
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

  // JSON/JSONB — validate then quote
  if (t === 'json' || t === 'jsonb') {
    const s = typeof value === 'string' ? value : JSON.stringify(value);
    JSON.parse(s); // throws if invalid
    return `'${s.replace(/'/g, "''")}'::${t}`;
  }

  // Everything else → quoted string
  const s = String(value);
  return `'${s.replace(/'/g, "''")}'`;
}

/** Quote an identifier for SQL. */
function qi(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Determine whether a column type is geometry/geography. */
function isGeoCol(type: string) {
  return /^(geometry|geography)/i.test(type);
}

/** Determine whether a column type is numeric. */
function isNumericType(type: string) {
  return /^(smallint|integer|bigint|int[248]?|serial|bigserial|smallserial|numeric|decimal|real|float[48]?|double precision|money|oid)$/i.test(type);
}

/** Determine whether a column type is boolean. */
function isBoolType(type: string) {
  return /^bool(ean)?$/i.test(type);
}

/** Determine whether a column type is JSON. */
function isJsonType(type: string) {
  return /^json(b)?$/i.test(type);
}

interface EditableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  editing: boolean;
  dataIndex: string;
  colType: string;
  children: React.ReactNode;
}

function EditableCell({ editing, dataIndex, colType, children, ...rest }: EditableCellProps) {
  if (!editing) return <td {...rest}>{children}</td>;

  let input: React.ReactNode;
  if (isBoolType(colType)) {
    input = (
      <Select
        options={[
          { label: 'true', value: 'true' },
          { label: 'false', value: 'false' },
          { label: 'NULL', value: '' },
        ]}
        style={{ width: '100%' }}
      />
    );
  } else if (isNumericType(colType)) {
    input = <InputNumber style={{ width: '100%' }} />;
  } else if (isJsonType(colType)) {
    input = <Input.TextArea autoSize={{ minRows: 1, maxRows: 6 }} />;
  } else {
    input = <Input />;
  }

  return (
    <td {...rest}>
      <Form.Item name={dataIndex} style={{ margin: 0 }}>
        {input}
      </Form.Item>
    </td>
  );
}

export default function DataEditor({ schema, table, columns, constraints }: Props) {
  const [form] = Form.useForm();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string>('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const fetchIdRef = useRef(0);

  // --- PK detection ---
  const pkConstraint = constraints.find((c: any) => c.constraint === 'primary');
  const pkColumns: string[] = useMemo(
    () => pkConstraint?.columns ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(pkConstraint?.columns)],
  );
  const hasPk = pkColumns.length > 0;

  // Column metadata lookup
  const colMap = new Map<string, any>();
  for (const c of columns) colMap.set(c.name, c);

  // Build a unique row key from PK values
  const rowKey = (record: any) => {
    if (!hasPk) return String(record._rowIdx);
    return pkColumns.map((c) => String(record[c] ?? '')).join('||');
  };

  // --- Fetch data ---
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const id = ++fetchIdRef.current;
    try {
      const fqTable = `${qi(schema)}.${qi(table)}`;
      const orderBy = hasPk ? pkColumns.map(qi).join(', ') : '1';
      const offset = (page - 1) * pageSize;

      const [countRes, dataRes] = await Promise.all([
        getSql().exec({ q: `SELECT count(*)::integer AS cnt FROM ${fqTable}` }),
        getSql().exec({ q: `SELECT * FROM ${fqTable} ORDER BY ${orderBy} LIMIT ${pageSize} OFFSET ${offset}` }),
      ]);

      if (id !== fetchIdRef.current) return; // stale
      const rows = (dataRes as any).data ?? [];
      setData(rows.map((r: any, i: number) => ({ ...r, _rowIdx: offset + i })));
      setTotal((countRes as any).data?.[0]?.cnt ?? 0);
    } catch (e: any) {
      if (id !== fetchIdRef.current) return;
      setError(e.message ?? String(e));
    } finally {
      if (id === fetchIdRef.current) setLoading(false);
    }
  }, [schema, table, page, pageSize, hasPk, pkColumns]);

  useEffect(() => {
    setEditingKey('');
    if (columns.length > 0) fetchData();
  }, [fetchData, columns.length]);

  // --- Editability helpers ---
  const isColReadOnly = (colName: string, isNewRow: boolean) => {
    const col = colMap.get(colName);
    if (!col) return true;
    if (col.identity_generation === 'always') return true;
    if (isGeoCol(col.type)) return true;
    if (!isNewRow && pkColumns.includes(colName)) return true;
    return false;
  };

  const isEditing = (record: any) => rowKey(record) === editingKey;

  // --- Edit ---
  const edit = (record: any) => {
    const values: any = {};
    for (const col of columns) {
      let v = record[col.name];
      if (isBoolType(col.type)) {
        v = v === null || v === undefined ? '' : String(v);
      } else if (isJsonType(col.type) && v !== null && v !== undefined) {
        v = typeof v === 'string' ? v : JSON.stringify(v, null, 2);
      }
      values[col.name] = v;
    }
    form.setFieldsValue(values);
    setEditingKey(rowKey(record));
  };

  const cancel = () => {
    setEditingKey('');
  };

  // --- Save (UPDATE) ---
  const save = async (record: any) => {
    try {
      const row = await form.validateFields();
      const fqTable = `${qi(schema)}.${qi(table)}`;

      const setClauses: string[] = [];
      for (const col of columns) {
        if (isColReadOnly(col.name, false)) continue;
        const oldVal = record[col.name];
        const newVal = row[col.name];
        // Normalize for comparison
        if (isJsonType(col.type) && oldVal !== null && oldVal !== undefined) {
          const oldStr = typeof oldVal === 'string' ? oldVal : JSON.stringify(oldVal);
          if (newVal === oldStr) continue;
        } else {
          const oldStr = oldVal === null || oldVal === undefined ? '' : String(oldVal);
          const newStr = newVal === null || newVal === undefined ? '' : String(newVal);
          if (oldStr === newStr) continue;
        }
        setClauses.push(`${qi(col.name)} = ${sqlLiteral(newVal, col.type)}`);
      }
      if (setClauses.length === 0) {
        message.info('No changes');
        setEditingKey('');
        return;
      }
      const where = pkColumns.map((c) => `${qi(c)} = ${sqlLiteral(record[c], colMap.get(c)!.type)}`).join(' AND ');
      await getSql().exec({
        q: `UPDATE ${fqTable} SET ${setClauses.join(', ')} WHERE ${where}`,
      });
      message.success('Row updated');
      setEditingKey('');
      fetchData();
    } catch (e: any) {
      message.error(e.message ?? String(e));
    }
  };

  // --- Delete ---
  const handleDelete = (record: any) => {
    const pkDisplay = pkColumns.map((c) => `${c}=${record[c]}`).join(', ');
    confirmDelete(pkDisplay, async () => {
      try {
        const fqTable = `${qi(schema)}.${qi(table)}`;
        const where = pkColumns.map((c) => `${qi(c)} = ${sqlLiteral(record[c], colMap.get(c)!.type)}`).join(' AND ');
        await getSql().exec({ q: `DELETE FROM ${fqTable} WHERE ${where}` });
        message.success('Row deleted');
        fetchData();
      } catch (e: any) {
        message.error(e.message ?? String(e));
      }
    });
  };

  // --- Table columns ---
  const tableColumns: any[] = columns.map((col: any) => {
    const readOnly = isColReadOnly(col.name, false);
    return {
      title: (
        <span>
          {col.name}
          {pkColumns.includes(col.name) && <Typography.Text type="warning" style={{ marginLeft: 4 }}>PK</Typography.Text>}
        </span>
      ),
      dataIndex: col.name,
      key: col.name,
      ellipsis: true,
      width: isGeoCol(col.type) ? 120 : undefined,
      onCell: (record: any) => ({
        dataIndex: col.name,
        colType: col.type,
        editing: isEditing(record) && !readOnly,
      }),
      render: (v: unknown) => {
        if (v === null || v === undefined) return <Typography.Text type="secondary" italic>NULL</Typography.Text>;
        if (isGeoCol(col.type)) {
          const s = String(v);
          return <Typography.Text code style={{ fontSize: 11 }}>{s.length > 30 ? s.slice(0, 30) + '...' : s}</Typography.Text>;
        }
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
      },
    };
  });

  // Actions column
  if (hasPk) {
    tableColumns.push({
      title: 'Actions',
      key: '_actions',
      fixed: 'right' as const,
      width: 120,
      render: (_: unknown, record: any) => {
        if (isEditing(record)) {
          return (
            <Space>
              <Button size="small" type="primary" icon={<SaveOutlined />} onClick={() => save(record)} />
              <Button size="small" icon={<CloseOutlined />} onClick={cancel} />
            </Space>
          );
        }
        return (
          <Space>
            <Button size="small" icon={<EditOutlined />} disabled={editingKey !== ''} onClick={() => edit(record)} />
            <Button size="small" danger icon={<DeleteOutlined />} disabled={editingKey !== ''} onClick={() => handleDelete(record)} />
          </Space>
        );
      },
    });
  }

  return (
    <div>
      {!hasPk && (
        <Alert
          type="warning"
          message="This table has no primary key. Data is read-only."
          showIcon
          style={{ marginBottom: 12 }}
        />
      )}
      {error && <Alert type="error" message={error} showIcon closable style={{ marginBottom: 12 }} />}
      <Space style={{ marginBottom: 12 }}>
        {hasPk && (
          <Button icon={<PlusOutlined />} onClick={() => setDrawerOpen(true)} disabled={editingKey !== ''}>
            Add Row
          </Button>
        )}
        <Button icon={<ReloadOutlined />} onClick={fetchData} disabled={editingKey !== ''}>
          Refresh
        </Button>
        <Typography.Text type="secondary">{total} rows total</Typography.Text>
      </Space>
      <Form form={form} component={false}>
        <Table
          components={{ body: { cell: EditableCell } }}
          dataSource={data}
          columns={tableColumns}
          rowKey={rowKey}
          size="small"
          loading={loading}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: PAGE_SIZE_OPTIONS,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      </Form>
      <RowFormDrawer
        open={drawerOpen}
        schema={schema}
        table={table}
        columns={columns}
        onClose={() => setDrawerOpen(false)}
        onDone={() => { setDrawerOpen(false); fetchData(); }}
      />
    </div>
  );
}
