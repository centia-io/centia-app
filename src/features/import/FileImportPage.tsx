import { useState } from 'react';
import { Upload, Button, Form, Input, Select, Switch, Space, Steps, Card, Alert, message } from 'antd';
import { UploadOutlined, CloudUploadOutlined } from '@ant-design/icons';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { useQuery } from '@tanstack/react-query';

export default function FileImportPage() {
  const { data: schemasData } = useQuery({
    queryKey: ['schemas'],
    queryFn: async () => await getAdminClient().provisioning.schemas.getSchema() as any[],
    staleTime: 30_000,
  });
  const schemas: string[] = (schemasData?.map((s: any) => s.name) ?? []).sort();

  const [step, setStep] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [dryResult, setDryResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm();

  const handleUpload = async (file: File) => {
    try {
      const formData = new FormData();
      formData.append('filename', file);
      await getAdminClient().provisioning.fileImport.postFileUpload(formData);
      setUploadedFile(file.name);
      message.success('File uploaded');
      setStep(1);
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    }
    return false; // prevent antd auto upload
  };

  const handleDryRun = async () => {
    const values = await form.validateFields();
    setError(null);
    try {
      const data = await getAdminClient().provisioning.fileImport.postFileProcess({
        ...values,
        file: uploadedFile!,
        import: false,
      });
      setDryResult(data);
      setStep(2);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    }
  };

  const handleImport = async () => {
    const values = await form.validateFields();
    setImporting(true);
    setError(null);
    try {
      const data = await getAdminClient().provisioning.fileImport.postFileProcess({
        ...values,
        file: uploadedFile!,
        import: true,
      });
      setImportResult(data);
      setStep(3);
      message.success('Import completed');
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <h2>File Import</h2>
      <Steps current={step} style={{ marginBottom: 24 }} items={[
        { title: 'Upload' },
        { title: 'Configure' },
        { title: 'Preview' },
        { title: 'Done' },
      ]} />

      {step === 0 && (
        <Card>
          <Upload.Dragger beforeUpload={handleUpload} showUploadList={false}>
            <p><UploadOutlined style={{ fontSize: 48, color: '#1890ff' }} /></p>
            <p>Click or drag file to upload</p>
            <p style={{ color: '#888' }}>Supports CSV, GeoJSON, Shapefile (zip), GeoPackage, KML</p>
          </Upload.Dragger>
        </Card>
      )}

      {step >= 1 && (
        <Card title={`File: ${uploadedFile}`} style={{ marginBottom: 16 }}>
          <Form form={form} layout="vertical" initialValues={{
            s_srs: 'EPSG:4326', t_srs: 'EPSG:4326', append: false, truncate: false, p_multi: false,
          }}>
            <Form.Item name="schema" label="Target Schema" rules={[{ required: true }]}>
              <Select options={schemas.map((s) => ({ label: s, value: s }))} />
            </Form.Item>
            <Form.Item name="s_srs" label="Source SRS">
              <Input />
            </Form.Item>
            <Form.Item name="t_srs" label="Target SRS">
              <Input />
            </Form.Item>
            <Form.Item name="append" label="Append to existing table" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="truncate" label="Truncate before append" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="p_multi" label="Promote to multi geometry" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="timestamp" label="Timestamp field name">
              <Input placeholder="Optional" />
            </Form.Item>
            <Space>
              <Button onClick={handleDryRun}>Dry Run (Preview)</Button>
              <Button type="primary" icon={<CloudUploadOutlined />} onClick={handleImport} loading={importing}>
                Import
              </Button>
            </Space>
          </Form>
        </Card>
      )}

      {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} />}

      {dryResult && step === 2 && (
        <Card title="Dry Run Result">
          <pre style={{ maxHeight: 300, overflow: 'auto' }}>{JSON.stringify(dryResult, null, 2)}</pre>
          <Button type="primary" icon={<CloudUploadOutlined />} onClick={handleImport} loading={importing} style={{ marginTop: 12 }}>
            Proceed with Import
          </Button>
        </Card>
      )}

      {importResult && step === 3 && (
        <Card title="Import Complete">
          <Alert type="success" message="File imported successfully" style={{ marginBottom: 12 }} />
          <pre>{JSON.stringify(importResult, null, 2)}</pre>
          <Button onClick={() => { setStep(0); setUploadedFile(null); setDryResult(null); setImportResult(null); }}>
            Import Another File
          </Button>
        </Card>
      )}
    </div>
  );
}
