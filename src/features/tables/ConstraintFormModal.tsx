import { Drawer, Form, Input, Select, Button } from 'antd';

interface Props {
  open: boolean;
  columns: string[];
  onOk: (values: any) => void;
  onCancel: () => void;
  saving?: boolean;
}

export default function ConstraintFormModal({ open, columns, onOk, onCancel, saving }: Props) {
  const [form] = Form.useForm();
  const constraintType = Form.useWatch('constraint', form);

  const handleOk = async () => {
    const values = await form.validateFields();
    onOk(values);
  };

  return (
    <Drawer title="Add Constraint" open={open} onClose={onCancel} width={480}
      extra={<Button type="primary" onClick={handleOk} loading={saving}>Save</Button>}
      afterOpenChange={(visible) => { if (!visible) form.resetFields(); }}>
      <Form form={form} layout="vertical" initialValues={{ constraint: 'primary' }}>
        <Form.Item name="constraint" label="Type" rules={[{ required: true }]}>
          <Select options={[
            { label: 'Primary Key', value: 'primary' },
            { label: 'Unique', value: 'unique' },
            { label: 'Foreign Key', value: 'foreign' },
            { label: 'Check', value: 'check' },
          ]} />
        </Form.Item>
        <Form.Item name="columns" label="Columns" rules={[{ required: true }]}>
          <Select mode="multiple" options={columns.map((c) => ({ label: c, value: c }))} />
        </Form.Item>
        {constraintType === 'foreign' && (
          <>
            <Form.Item name="referenced_table" label="Referenced Table" rules={[{ required: true }]}>
              <Input placeholder="schema.table" />
            </Form.Item>
            <Form.Item name="referenced_columns" label="Referenced Columns">
              <Select mode="tags" />
            </Form.Item>
          </>
        )}
        {constraintType === 'check' && (
          <Form.Item name="check" label="Check Expression" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
        )}
        <Form.Item name="name" label="Constraint Name">
          <Input placeholder="Optional" />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
