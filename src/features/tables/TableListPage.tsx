import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Table, Button, Space, Drawer, Modal, Form, Input, InputNumber, Select, Checkbox, Spin, Alert, Tabs, Typography } from 'antd';
import { message } from '../../utils/message';
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined, SaveOutlined, CodeOutlined, EditOutlined } from '@ant-design/icons';
import { getMeta } from '../../baas/client';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import SchemaForm from '../../components/SchemaForm';
import { testPropertiesSchema } from '../../data/testPropertiesSchema';
import { confirmDelete } from '../../components/ConfirmDelete';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '../../data/queryClient';
import { rollback } from '../../data/optimistic';

// ──── Types ────

type SchemaDetailResponse = {
  name: string;
  tables?: Array<{ name: string; columns?: unknown[] }>;
};

interface TableMeta {
  title: string;
  abstract: string;
  group: string;
  sort_id: number | null;
  tags: string[];
}

// ──── Tables ────

function TablesPanel({ schema }: { schema: string }) {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [form] = Form.useForm();
  const [tablesMeta, setTablesMeta] = useState<Record<string, TableMeta>>({});
  const [dirtyMeta, setDirtyMeta] = useState<Record<string, Partial<TableMeta>>>({});
  const [savingMeta, setSavingMeta] = useState<string | null>(null);
  const [tablesProps, setTablesProps] = useState<Record<string, Record<string, any>>>({});
  const [propsModal, setPropsModal] = useState<string | null>(null);
  const [propsForm] = Form.useForm();
  const [savingProps, setSavingProps] = useState(false);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkForm] = Form.useForm();
  const [bulkEnabled, setBulkEnabled] = useState<Record<string, boolean>>({});
  const [bulkPropsForm] = Form.useForm();
  const [bulkPropsEnabled, setBulkPropsEnabled] = useState<Record<string, boolean>>({});
  const [savingBulk, setSavingBulk] = useState(false);

  const queryKey = ['schema-detail', schema] as const;

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      return await getAdminClient().provisioning.schemas.getSchema(schema) as SchemaDetailResponse;
    },
    staleTime: 30_000,
  });

  const tables =
    data?.tables?.map((t) => ({
      name: t.name,
      columnCount: t.columns?.length ?? 0,
    })) ?? [];

  const fetchMeta = useCallback(() => {
    if (!tables.length) return;
    const query = tables.map((t) => `${schema}.${t.name}`).join(',');
    getMeta().query(query)
      .then((res: any) => {
        const rels = res?.relations ?? {};
        const meta: Record<string, TableMeta> = {};
        const props: Record<string, Record<string, any>> = {};
        for (const t of tables) {
          const key = `${schema}.${t.name}`;
          const m = rels[key] ?? {};
          meta[t.name] = {
            title: m.title ?? '',
            abstract: m.abstract ?? '',
            group: m.group ?? '',
            sort_id: m.sort_id ?? null,
            tags: m.tags ?? [],
          };
          props[t.name] = m.properties ?? {};
        }
        setTablesMeta(meta);
        setTablesProps(props);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, tables.length]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  const updateDirty = (tableName: string, key: keyof TableMeta, value: any) => {
    setDirtyMeta((prev) => ({
      ...prev,
      [tableName]: { ...prev[tableName], [key]: value },
    }));
  };

  const saveMeta = async (tableName: string) => {
    const current = tablesMeta[tableName] ?? { title: '', abstract: '', group: '', sort_id: null, tags: [] };
    const changes = dirtyMeta[tableName];
    if (!changes) return;

    const merged = { ...current, ...changes };
    const qualifiedName = `${schema}.${tableName}`;
    setSavingMeta(tableName);
    try {
      await getAdminClient().provisioning.metadata.patchMetaData({
        relations: {
          [qualifiedName]: {
            title: merged.title || null,
            abstract: merged.abstract || null,
            group: merged.group || null,
            sort_id: merged.sort_id,
            tags: merged.tags?.length ? merged.tags : null,
          },
        },
      }).catch((e: any) => {
        if (e?.status === 204) return;
        throw e;
      });
      message.success(`Metadata for "${tableName}" updated`);
      setTablesMeta((prev) => ({ ...prev, [tableName]: merged }));
      setDirtyMeta((prev) => {
        const next = { ...prev };
        delete next[tableName];
        return next;
      });
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSavingMeta(null);
    }
  };

  const openPropsModal = (tableName: string) => {
    propsForm.setFieldsValue(tablesProps[tableName] ?? {});
    setPropsModal(tableName);
  };

  const saveProps = async () => {
    if (!propsModal) return;
    const properties = propsForm.getFieldsValue();
    // Strip undefined/null values
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(properties)) {
      if (v !== undefined && v !== null && v !== '') cleaned[k] = v;
    }
    const qualifiedName = `${schema}.${propsModal}`;
    setSavingProps(true);
    try {
      await getAdminClient().provisioning.metadata.patchMetaData({
        relations: {
          [qualifiedName]: {
            properties: Object.keys(cleaned).length ? cleaned : null,
          },
        },
      }).catch((e: any) => {
        if (e?.status === 204) return;
        throw e;
      });
      message.success(`Properties for "${propsModal}" updated`);
      setTablesProps((prev) => ({ ...prev, [propsModal]: cleaned }));
      setPropsModal(null);
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSavingProps(false);
    }
  };

  const openBulkModal = () => {
    bulkForm.resetFields();
    bulkPropsForm.resetFields();
    setBulkEnabled({});
    setBulkPropsEnabled({});
    setBulkOpen(true);
  };

  const saveBulk = async () => {
    const values = bulkForm.getFieldsValue();
    const enabledKeys = Object.entries(bulkEnabled).filter(([, v]) => v).map(([k]) => k);
    const enabledPropKeys = Object.entries(bulkPropsEnabled).filter(([, v]) => v).map(([k]) => k);

    if (!enabledKeys.length && !enabledPropKeys.length) {
      message.warning('No fields selected');
      return;
    }

    let properties: Record<string, any> | undefined;
    if (enabledPropKeys.length) {
      const propValues = bulkPropsForm.getFieldsValue();
      properties = {};
      for (const key of enabledPropKeys) {
        const v = propValues[key];
        if (v !== undefined && v !== null && v !== '') properties[key] = v;
      }
    }

    const relations: Record<string, any> = {};
    for (const tableName of selectedRows) {
      const patch: Record<string, any> = {};
      for (const key of enabledKeys) {
        if (key === 'title') patch.title = values.title || null;
        if (key === 'abstract') patch.abstract = values.abstract || null;
        if (key === 'group') patch.group = values.group || null;
        if (key === 'sort_id') patch.sort_id = values.sort_id ?? null;
        if (key === 'tags') patch.tags = values.tags?.length ? values.tags : null;
      }
      if (properties !== undefined) {
        // Merge with existing properties for each table
        const existing = tablesProps[tableName] ?? {};
        patch.properties = { ...existing, ...properties };
        if (!Object.keys(patch.properties).length) patch.properties = null;
      }
      relations[`${schema}.${tableName}`] = patch;
    }

    setSavingBulk(true);
    try {
      await getAdminClient().provisioning.metadata.patchMetaData({ relations }).catch((e: any) => {
        if (e?.status === 204) return;
        throw e;
      });
      message.success(`Metadata updated for ${selectedRows.length} tables`);
      setBulkOpen(false);
      setSelectedRows([]);
      fetchMeta();
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSavingBulk(false);
    }
  };

  const getMetaValue = (tableName: string, key: keyof TableMeta) => {
    if (dirtyMeta[tableName] && key in dirtyMeta[tableName]) return dirtyMeta[tableName][key];
    return tablesMeta[tableName]?.[key] ?? (key === 'tags' ? [] : key === 'sort_id' ? null : '');
  };

  const handleCreate = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await getAdminClient().provisioning.tables.postTable(schema, { name: values.name });
      message.success(`Table "${values.name}" created`);
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['schemas'] });
      form.resetFields();
      setCreateOpen(false);
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (name: string) => {
    confirmDelete(name, async () => {
      const ctx = {
        queryKey,
        previous: queryClient.getQueryData(queryKey),
      };
      queryClient.setQueryData(queryKey, (old: SchemaDetailResponse | undefined) => {
        if (!old) return old;
        return { ...old, tables: (old.tables ?? []).filter((t) => t.name !== name) };
      });
      try {
        await getAdminClient().provisioning.tables.deleteTable(schema, name);
        message.success(`Table "${name}" deleted`);
        queryClient.invalidateQueries({ queryKey });
        queryClient.invalidateQueries({ queryKey: ['schemas'] });
      } catch (e: unknown) {
        rollback(ctx);
        message.error(getErrorMessage(e));
      }
    });
  };

  if (isLoading) return <Spin />;
  if (error) return <Alert type="error" message={String(error)} />;

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'flex-end', width: '100%' }}>
        {selectedRows.length > 0 && (
          <Button icon={<EditOutlined />} onClick={openBulkModal}>
            Edit Metadata ({selectedRows.length})
          </Button>
        )}
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>New Table</Button>
      </Space>
      <Input.Search placeholder="Search tables..." allowClear onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12, maxWidth: 300 }} />
      <Table
        dataSource={tables.filter((r) => !search || r.name.toLowerCase().includes(search.toLowerCase()))}
        rowKey="name"
        size="small"
        pagination={false}
        rowSelection={{
          selectedRowKeys: selectedRows,
          onChange: (keys) => setSelectedRows(keys as string[]),
        }}
        columns={[
          { title: 'Name', dataIndex: 'name', key: 'name', width: 160,
            sorter: (a, b) => a.name.localeCompare(b.name),
            render: (name: string) => <a onClick={() => navigate(`/schemas/${schema}/tables/${name}`)}>{name}</a>,
          },
          { title: 'Columns', dataIndex: 'columnCount', key: 'columnCount', width: 80,
            sorter: (a, b) => a.columnCount - b.columnCount,
          },
          { title: 'Title', key: 'title', width: 150,
            render: (_: unknown, record: any) => (
              <Input size="small" placeholder="—"
                value={(getMetaValue(record.name, 'title') as string) ?? ''}
                onChange={(e) => updateDirty(record.name, 'title', e.target.value)}
              />
            ),
          },
          { title: 'Abstract', key: 'abstract', width: 180,
            render: (_: unknown, record: any) => (
              <Input size="small" placeholder="—"
                value={(getMetaValue(record.name, 'abstract') as string) ?? ''}
                onChange={(e) => updateDirty(record.name, 'abstract', e.target.value)}
              />
            ),
          },
          { title: 'Group', key: 'group', width: 120,
            render: (_: unknown, record: any) => (
              <Input size="small" placeholder="—"
                value={(getMetaValue(record.name, 'group') as string) ?? ''}
                onChange={(e) => updateDirty(record.name, 'group', e.target.value)}
              />
            ),
          },
          { title: 'Sort ID', key: 'sort_id', width: 80,
            render: (_: unknown, record: any) => (
              <InputNumber size="small" placeholder="—"
                value={getMetaValue(record.name, 'sort_id') as number | null}
                onChange={(v) => updateDirty(record.name, 'sort_id', v)}
                style={{ width: '100%' }}
              />
            ),
          },
          { title: 'Tags', key: 'tags', width: 160,
            render: (_: unknown, record: any) => (
              <Select size="small" mode="tags" placeholder="—" style={{ width: '100%' }}
                value={(getMetaValue(record.name, 'tags') as string[]) ?? []}
                onChange={(v) => updateDirty(record.name, 'tags', v)}
              />
            ),
          },
          { title: 'Properties', key: 'properties', width: 90, align: 'center' as const,
            render: (_: unknown, record: any) => (
              <Button size="small" icon={<CodeOutlined />} onClick={() => openPropsModal(record.name)}>
                Edit
              </Button>
            ),
          },
          { title: 'Actions', key: 'actions', width: 100,
            render: (_: unknown, record: any) => (
              <Space>
                {dirtyMeta[record.name] && (
                  <Button size="small" type="primary" icon={<SaveOutlined />}
                    loading={savingMeta === record.name}
                    onClick={() => saveMeta(record.name)}
                  />
                )}
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.name)} />
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={`Properties — ${propsModal}`}
        open={!!propsModal}
        onCancel={() => setPropsModal(null)}
        onOk={saveProps}
        confirmLoading={savingProps}
        okText="Save"
        width={600}
        destroyOnClose
      >
        <div style={{ maxHeight: 500, overflowY: 'auto', paddingRight: 8 }}>
          <SchemaForm schema={testPropertiesSchema} form={propsForm} />
        </div>
      </Modal>
      <Modal
        title={`Bulk Edit Metadata (${selectedRows.length} tables)`}
        open={bulkOpen}
        onCancel={() => setBulkOpen(false)}
        onOk={saveBulk}
        confirmLoading={savingBulk}
        okText="Apply"
        width={600}
        destroyOnClose
      >
        <p style={{ marginBottom: 16, color: '#888' }}>
          Only checked fields will be applied. Unchecked fields remain unchanged.
        </p>
        <Form form={bulkForm} layout="vertical">
          <Form.Item label={<Checkbox checked={!!bulkEnabled.title} onChange={(e) => setBulkEnabled((p) => ({ ...p, title: e.target.checked }))}>Title</Checkbox>} name="title">
            <Input placeholder="Title" disabled={!bulkEnabled.title} />
          </Form.Item>
          <Form.Item label={<Checkbox checked={!!bulkEnabled.abstract} onChange={(e) => setBulkEnabled((p) => ({ ...p, abstract: e.target.checked }))}>Abstract</Checkbox>} name="abstract">
            <Input.TextArea rows={2} placeholder="Abstract" disabled={!bulkEnabled.abstract} />
          </Form.Item>
          <Form.Item label={<Checkbox checked={!!bulkEnabled.group} onChange={(e) => setBulkEnabled((p) => ({ ...p, group: e.target.checked }))}>Group</Checkbox>} name="group">
            <Input placeholder="Group" disabled={!bulkEnabled.group} />
          </Form.Item>
          <Form.Item label={<Checkbox checked={!!bulkEnabled.sort_id} onChange={(e) => setBulkEnabled((p) => ({ ...p, sort_id: e.target.checked }))}>Sort ID</Checkbox>} name="sort_id">
            <InputNumber style={{ width: '100%' }} placeholder="Sort ID" disabled={!bulkEnabled.sort_id} />
          </Form.Item>
          <Form.Item label={<Checkbox checked={!!bulkEnabled.tags} onChange={(e) => setBulkEnabled((p) => ({ ...p, tags: e.target.checked }))}>Tags</Checkbox>} name="tags">
            <Select mode="tags" placeholder="Tags" disabled={!bulkEnabled.tags} />
          </Form.Item>
        </Form>
        <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
          <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>Properties</Typography.Text>
          <p style={{ marginBottom: 12, color: '#888', fontSize: 13 }}>
            Only checked property fields will be applied to the selected tables.
          </p>
          <SchemaForm
            schema={testPropertiesSchema}
            form={bulkPropsForm}
            enabledFields={bulkPropsEnabled}
            onEnabledChange={setBulkPropsEnabled}
          />
        </div>
      </Modal>
      <Drawer title="Create Table" open={createOpen} onClose={() => setCreateOpen(false)} width={400}
        extra={<Button type="primary" onClick={handleCreate} loading={saving}>Save</Button>}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Table Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}

// ──── Sequences ────

function SequencesPanel({ schema }: { schema: string }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [form] = Form.useForm();

  const { data, isLoading, error } = useQuery({
    queryKey: ['sequences', schema],
    queryFn: async () => {
      return await getAdminClient().provisioning.sequences.getSequence(schema);
    },
    staleTime: 30_000,
  });

  const sequences = data ?? [];

  const handleCreate = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await getAdminClient().provisioning.sequences.postSequence(schema, values);
      message.success('Sequence created');
      queryClient.invalidateQueries({ queryKey: ['sequences', schema] });
      form.resetFields();
      setCreateOpen(false);
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (name: string) => {
    confirmDelete(name, async () => {
      try {
        await getAdminClient().provisioning.sequences.deleteSequence(schema, name);
        message.success('Sequence deleted');
        queryClient.invalidateQueries({ queryKey: ['sequences', schema] });
      } catch (e: unknown) {
        message.error(getErrorMessage(e));
      }
    });
  };

  if (isLoading) return <Spin />;
  if (error) return <Alert type="error" message={String(error)} />;

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'flex-end', width: '100%' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>New Sequence</Button>
      </Space>
      <Input.Search placeholder="Search sequences..." allowClear onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12, maxWidth: 300 }} />
      <Table
        dataSource={(sequences as any[]).filter((r) => !search || (r.name ?? '').toLowerCase().includes(search.toLowerCase()))}
        rowKey="name"
        size="small"
        pagination={false}
        columns={[
          { title: 'Name', dataIndex: 'name', key: 'name',
            sorter: (a: any, b: any) => (a.name ?? '').localeCompare(b.name ?? ''),
          },
          { title: 'Data Type', dataIndex: 'data_type', key: 'data_type',
            sorter: (a: any, b: any) => (a.data_type ?? '').localeCompare(b.data_type ?? ''),
          },
          { title: 'Start', dataIndex: 'start_value', key: 'start' },
          { title: 'Increment', dataIndex: 'increment_by', key: 'increment' },
          { title: 'Actions', key: 'actions', width: 80,
            render: (_: unknown, record: any) => (
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.name)} />
            ),
          },
        ]}
      />
      <Drawer title="Create Sequence" open={createOpen} onClose={() => setCreateOpen(false)} width={400}
        extra={<Button type="primary" onClick={handleCreate} loading={saving}>Save</Button>}>
        <Form form={form} layout="vertical" initialValues={{ data_type: 'bigint', increment_by: 1 }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="data_type" label="Data Type">
            <Select options={[
              { label: 'smallint', value: 'smallint' },
              { label: 'integer', value: 'integer' },
              { label: 'bigint', value: 'bigint' },
            ]} />
          </Form.Item>
          <Form.Item name="start_value" label="Start Value">
            <Input type="number" />
          </Form.Item>
          <Form.Item name="increment_by" label="Increment By">
            <Input type="number" />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}

// ──── Page ────

export default function TableListPage() {
  const { s: schema } = useParams<{ s: string }>();
  const navigate = useNavigate();

  return (
    <div>
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/schemas')} style={{ marginBottom: 8 }}>
        Schemas
      </Button>
      <h2>{schema}</h2>
      <Tabs
        defaultActiveKey="tables"
        items={[
          { key: 'tables', label: 'Tables', children: <TablesPanel schema={schema!} /> },
          { key: 'sequences', label: 'Sequences', children: <SequencesPanel schema={schema!} /> },
        ]}
      />
    </div>
  );
}
