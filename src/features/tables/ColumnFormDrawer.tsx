import { useEffect } from 'react';
import { Drawer, Form, Input, Select, Switch, Button } from 'antd';
import { message } from '../../utils/message';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import type { CreateColumnRequest, PatchColumnRequest } from '@centia-io/sdk';

const PG_TYPES = [
  'integer', 'bigint', 'smallint', 'serial', 'bigserial',
  'varchar', 'text', 'char', 'boolean',
  'numeric', 'real', 'double precision',
  'date', 'time', 'timetz', 'timestamp', 'timestamptz', 'interval',
  'json', 'jsonb', 'uuid',
  'geometry', 'geography',
  'integer[]', 'varchar[]', 'text[]', 'jsonb[]',
];

interface Props {
  open: boolean;
  schema: string;
  table: string;
  column?: any;
  onClose: () => void;
  onDone: (nameChanged: boolean) => void;
}

export default function ColumnFormDrawer({ open, schema, table, column, onClose, onDone }: Props) {
  const [form] = Form.useForm<{
    name: string;
    type: string;
    is_nullable?: boolean;
    default_value?: string;
    comment?: string;
  }>();
  const isEdit = !!column;

  useEffect(() => {
    if (open) {
      form.setFieldsValue(column ?? { name: '', type: '', is_nullable: true });
    }
  }, [open, column, form]);

  const handleSubmit = async () => {
    const raw = await form.validateFields();
    const admin = getAdminClient();

    try {
      if (isEdit) {
        const patch: PatchColumnRequest = {};
        if (raw.name) patch.name = raw.name;
        if (raw.type) patch.type = raw.type;
        if (raw.is_nullable !== undefined) patch.is_nullable = raw.is_nullable;
        if (raw.default_value) patch.default_value = raw.default_value;
        if (raw.comment) patch.comment = raw.comment;
        await admin.provisioning.columns.patchColumn(schema, table, column.name, patch);
      } else {
        const body: CreateColumnRequest = { name: raw.name, type: raw.type };
        if (raw.is_nullable !== undefined) body.is_nullable = raw.is_nullable;
        if (raw.default_value) body.default_value = raw.default_value;
        if (raw.comment) body.comment = raw.comment;
        await admin.provisioning.columns.postColumn(schema, table, body);
      }
      const nameChanged = isEdit ? raw.name !== column.name : true;
      message.success(isEdit ? 'Column updated' : 'Column created');
      form.resetFields();
      onDone(nameChanged);
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    }
  };

  return (
    <Drawer title={isEdit ? 'Edit Column' : 'Add Column'} open={open} onClose={onClose} width={400}
      extra={<Button type="primary" onClick={handleSubmit}>Save</Button>}>
      <Form form={form} layout="vertical" initialValues={column ?? { is_nullable: true }}>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        {!isEdit && (
          <Form.Item name="type" label="Type" rules={[{ required: true }]}>
            <Select options={PG_TYPES.map((t) => ({ label: t, value: t }))} showSearch />
          </Form.Item>
        )}
        {isEdit && (
          <Form.Item name="type" label="Type">
            <Select options={PG_TYPES.map((t) => ({ label: t, value: t }))} showSearch />
          </Form.Item>
        )}
        <Form.Item name="is_nullable" label="Nullable" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="default_value" label="Default Value">
          <Input />
        </Form.Item>
        <Form.Item name="comment" label="Comment">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
