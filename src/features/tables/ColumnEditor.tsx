import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Space, Input, InputNumber, Switch, Checkbox, Modal, Form, Select, Tag } from 'antd';
import { message } from '../../utils/message';
import { PlusOutlined, EditOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import { getMeta } from '../../baas/client';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { confirmDelete } from '../../components/ConfirmDelete';
import ColumnFormDrawer from './ColumnFormDrawer';

interface Props {
  schema: string;
  table: string;
  columns: any[];
  onRefresh: () => void;
}

interface FieldMeta {
  alias: string | null;
  queryable: boolean;
  sort_id: number | null;
}

export default function ColumnEditor({ schema, table, columns, onRefresh }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editCol, setEditCol] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [fieldsMeta, setFieldsMeta] = useState<Record<string, FieldMeta>>({});
  const [dirtyMeta, setDirtyMeta] = useState<Record<string, Partial<FieldMeta>>>({});
  const [savingMeta, setSavingMeta] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkForm] = Form.useForm();
  const [bulkEnabled, setBulkEnabled] = useState<Record<string, boolean>>({});
  const [savingBulk, setSavingBulk] = useState(false);

  const qualifiedName = `${schema}.${table}`;

  const fetchMeta = useCallback(() => {
    getMeta().query(qualifiedName)
      .then((res: any) => {
        const rel = res?.relations?.[qualifiedName] ?? res?.[qualifiedName] ?? {};
        const fields: Record<string, FieldMeta> = {};
        for (const [name, f] of Object.entries(rel.fields ?? {} as Record<string, any>)) {
          fields[name] = {
            alias: (f as any).alias ?? null,
            queryable: (f as any).queryable ?? false,
            sort_id: (f as any).sort_id ?? null,
          };
        }
        setFieldsMeta(fields);
        setDirtyMeta({});
      })
      .catch(() => {});
  }, [qualifiedName]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  const updateDirty = (colName: string, key: keyof FieldMeta, value: any) => {
    setDirtyMeta((prev) => ({
      ...prev,
      [colName]: { ...prev[colName], [key]: value },
    }));
  };

  const saveMeta = async (colName: string) => {
    const current = fieldsMeta[colName] ?? { alias: null, queryable: false, sort_id: null };
    const changes = dirtyMeta[colName];
    if (!changes) return;

    const merged = { ...current, ...changes };
    setSavingMeta(colName);
    try {
      await getAdminClient().provisioning.metadata.patchMetaData({
        relations: {
          [qualifiedName]: {
            fields: {
              [colName]: {
                alias: merged.alias || null,
                queryable: merged.queryable,
                sort_id: merged.sort_id,
              },
            },
          },
        },
      }).catch((e: any) => {
        if (e?.status === 204) return;
        throw e;
      });
      message.success(`Metadata for "${colName}" updated`);
      setFieldsMeta((prev) => ({ ...prev, [colName]: merged }));
      setDirtyMeta((prev) => {
        const next = { ...prev };
        delete next[colName];
        return next;
      });
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSavingMeta(null);
    }
  };

  const openBulkModal = () => {
    bulkForm.resetFields();
    setBulkEnabled({});
    setBulkOpen(true);
  };

  const saveBulk = async () => {
    const values = bulkForm.getFieldsValue();
    const enabledKeys = Object.entries(bulkEnabled).filter(([, v]) => v).map(([k]) => k);
    if (!enabledKeys.length) {
      message.warning('No fields selected');
      return;
    }

    const fieldsPatch: Record<string, any> = {};
    for (const colName of selectedRows) {
      const patch: Record<string, any> = {};
      if (enabledKeys.includes('alias')) patch.alias = values.alias || null;
      if (enabledKeys.includes('queryable')) patch.queryable = !!values.queryable;
      if (enabledKeys.includes('sort_id')) patch.sort_id = values.sort_id ?? null;
      fieldsPatch[colName] = patch;
    }

    setSavingBulk(true);
    try {
      await getAdminClient().provisioning.metadata.patchMetaData({
        relations: {
          [qualifiedName]: { fields: fieldsPatch },
        },
      }).catch((e: any) => {
        if (e?.status === 204) return;
        throw e;
      });
      message.success(`Metadata updated for ${selectedRows.length} columns`);
      setBulkOpen(false);
      setSelectedRows([]);
      fetchMeta();
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSavingBulk(false);
    }
  };

  const handleDelete = (name: string) => {
    confirmDelete(name, async () => {
      try {
        const admin = getAdminClient();
        await admin.provisioning.columns.deleteColumn(schema, table, name);
        message.success(`Column "${name}" deleted`);
        onRefresh();
      } catch (e: unknown) {
        message.error(getErrorMessage(e));
      }
    });
  };

  const getFieldValue = (colName: string, key: keyof FieldMeta) => {
    if (dirtyMeta[colName] && key in dirtyMeta[colName]) return dirtyMeta[colName][key];
    return fieldsMeta[colName]?.[key] ?? (key === 'queryable' ? false : null);
  };

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<PlusOutlined />} onClick={() => { setEditCol(null); setDrawerOpen(true); }}>
          Add Column
        </Button>
        {selectedRows.length > 0 && (
          <Button icon={<EditOutlined />} onClick={openBulkModal}>
            Edit Metadata ({selectedRows.length})
          </Button>
        )}
      </Space>
      <Input.Search placeholder="Search columns..." allowClear onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12, maxWidth: 300 }} />
      <Table
        dataSource={columns.filter((r: any) => !search || [r.name, r.type].some((v: string) => (v ?? '').toLowerCase().includes(search.toLowerCase())))}
        rowKey="name"
        size="small"
        pagination={false}
        rowSelection={{
          selectedRowKeys: selectedRows,
          onChange: (keys) => setSelectedRows(keys as string[]),
        }}
        columns={[
          { title: 'Name', dataIndex: 'name', key: 'name',
            sorter: (a: any, b: any) => (a.name ?? '').localeCompare(b.name ?? ''),
          },
          { title: 'Type', dataIndex: 'type', key: 'type',
            sorter: (a: any, b: any) => (a.type ?? '').localeCompare(b.type ?? ''),
          },
          { title: 'Nullable', dataIndex: 'is_nullable', key: 'nullable',
            render: (v: boolean) => v ? <Tag color="blue">YES</Tag> : <Tag>NO</Tag>,
          },
          { title: 'Default', dataIndex: 'default_value', key: 'default' },
          { title: 'Alias', key: 'alias', width: 140,
            render: (_: unknown, record: any) => (
              <Input
                size="small"
                placeholder="—"
                value={getFieldValue(record.name, 'alias') ?? ''}
                onChange={(e) => updateDirty(record.name, 'alias', e.target.value || null)}
              />
            ),
          },
          { title: 'Queryable', key: 'queryable', width: 90, align: 'center' as const,
            render: (_: unknown, record: any) => (
              <Switch
                size="small"
                checked={!!getFieldValue(record.name, 'queryable')}
                onChange={(v) => updateDirty(record.name, 'queryable', v)}
              />
            ),
          },
          { title: 'Sort ID', key: 'sort_id', width: 90,
            render: (_: unknown, record: any) => (
              <InputNumber
                size="small"
                placeholder="—"
                value={getFieldValue(record.name, 'sort_id')}
                onChange={(v) => updateDirty(record.name, 'sort_id', v)}
                style={{ width: '100%' }}
              />
            ),
          },
          { title: 'Actions', key: 'actions', width: 130,
            render: (_: unknown, record: any) => (
              <Space>
                {dirtyMeta[record.name] && (
                  <Button
                    size="small"
                    type="primary"
                    icon={<SaveOutlined />}
                    loading={savingMeta === record.name}
                    onClick={() => saveMeta(record.name)}
                  />
                )}
                <Button size="small" icon={<EditOutlined />} onClick={() => { setEditCol(record); setDrawerOpen(true); }} />
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.name)} />
              </Space>
            ),
          },
        ]}
      />
      <ColumnFormDrawer
        open={drawerOpen}
        schema={schema}
        table={table}
        column={editCol}
        onClose={() => setDrawerOpen(false)}
        onDone={(nameChanged) => {
          setDrawerOpen(false);
          if (nameChanged) {
            message.loading({ content: 'Reloading table data...', key: 'col-reload', duration: 0 });
            setTimeout(() => message.destroy('col-reload'), 3000);
          }
          onRefresh();
          fetchMeta();
        }}
      />
      <Modal
        title={`Bulk Edit Field Metadata (${selectedRows.length} columns)`}
        open={bulkOpen}
        onCancel={() => setBulkOpen(false)}
        onOk={saveBulk}
        confirmLoading={savingBulk}
        okText="Apply"
        width={450}
        destroyOnClose
      >
        <p style={{ marginBottom: 16, color: '#888' }}>
          Only checked fields will be applied. Unchecked fields remain unchanged.
        </p>
        <Form form={bulkForm} layout="vertical">
          <Form.Item label={<Checkbox checked={!!bulkEnabled.alias} onChange={(e) => setBulkEnabled((p) => ({ ...p, alias: e.target.checked }))}>Alias</Checkbox>} name="alias">
            <Input placeholder="Alias" disabled={!bulkEnabled.alias} />
          </Form.Item>
          <Form.Item label={<Checkbox checked={!!bulkEnabled.queryable} onChange={(e) => setBulkEnabled((p) => ({ ...p, queryable: e.target.checked }))}>Queryable</Checkbox>} name="queryable" valuePropName="checked">
            <Switch disabled={!bulkEnabled.queryable} />
          </Form.Item>
          <Form.Item label={<Checkbox checked={!!bulkEnabled.sort_id} onChange={(e) => setBulkEnabled((p) => ({ ...p, sort_id: e.target.checked }))}>Sort ID</Checkbox>} name="sort_id">
            <InputNumber style={{ width: '100%' }} placeholder="Sort ID" disabled={!bulkEnabled.sort_id} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
