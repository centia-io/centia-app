import { Drawer, Form, Input, Select, Button } from 'antd';

interface Props {
  open: boolean;
  columns: string[];
  onOk: (values: any) => void;
  onCancel: () => void;
  saving?: boolean;
}

export default function IndexFormModal({ open, columns, onOk, onCancel, saving }: Props) {
  const [form] = Form.useForm();

  const handleOk = async () => {
    const values = await form.validateFields();
    onOk(values);
  };

  return (
    <Drawer title="Create Index" open={open} onClose={onCancel} width={480}
      extra={<Button type="primary" onClick={handleOk} loading={saving}>Save</Button>}
      afterOpenChange={(visible) => { if (!visible) form.resetFields(); }}>
      <Form form={form} layout="vertical" initialValues={{ method: 'btree' }}>
        <Form.Item name="columns" label="Columns" rules={[{ required: true }]}>
          <Select mode="multiple" options={columns.map((c) => ({ label: c, value: c }))} />
        </Form.Item>
        <Form.Item name="method" label="Method" rules={[{ required: true }]}>
          <Select options={[
            { label: 'btree', value: 'btree' },
            { label: 'brin', value: 'brin' },
            { label: 'gin', value: 'gin' },
            { label: 'gist', value: 'gist' },
            { label: 'hash', value: 'hash' },
          ]} />
        </Form.Item>
        <Form.Item name="name" label="Index Name">
          <Input placeholder="Optional (auto-generated)" />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
