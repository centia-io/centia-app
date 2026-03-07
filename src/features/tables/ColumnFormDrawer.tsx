import { useEffect } from 'react';
import { Drawer, Form, Input, Select, Switch, Button, message } from 'antd';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';

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
  const [form] = Form.useForm();
  const isEdit = !!column;

  useEffect(() => {
    if (open) {
      form.setFieldsValue(column ?? { name: '', type: '', is_nullable: true, default_value: '', comment: '' });
    }
  }, [open, column, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const admin = getAdminClient();

    try {
      if (isEdit) {
        await admin.provisioning.columns.patchColumn(schema, table, column.name, values);
      } else {
        await admin.provisioning.columns.postColumn(schema, table, values);
      }
      const nameChanged = isEdit ? values.name !== column.name : true;
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
