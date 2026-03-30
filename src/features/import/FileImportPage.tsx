import { useState } from 'react';
import { Upload, Button, Form, Input, Select, Switch, Space, Steps, Card, Alert, Table, Tag } from 'antd';
import { message } from '../../utils/message';
import { UploadOutlined, CloudUploadOutlined } from '@ant-design/icons';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';
import { useQuery } from '@tanstack/react-query';
import type { UploadFile } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { FileProcessResponse } from '@centia-io/sdk';
import JSZip from 'jszip';

const getResultColumns = (hasSsrs: boolean): ColumnsType<FileProcessResponse> => [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Driver', dataIndex: 'driver', key: 'driver' },
  { title: 'Rows', dataIndex: 'count', key: 'count', align: 'right' },
  {
    title: 'Geometry', dataIndex: 'geom_type', key: 'geom_type',
    render: (v: string) => v || <Tag color="default">None</Tag>,
  },
  { title: 'SRS', dataIndex: 'auth_str', key: 'auth_str' },
  {
    title: 'Status', key: 'error',
    render: (_: unknown, row: FileProcessResponse) => {
      if (row.error) return <Tag color="error">{row.error}</Tag>;
      if (!row.has_wkt && !hasSsrs) return <Tag color="warning">Missing projection - set Source SRS</Tag>;
      return <Tag color="success">OK</Tag>;
    },
  },
];

export default function FileImportPage() {
  const { data: schemasData } = useQuery({
    queryKey: ['schemas'],
    queryFn: async () => await getAdminClient().provisioning.schemas.getSchema() as any[],
    staleTime: 30_000,
  });
  const schemas: string[] = (schemasData?.map((s: any) => s.name) ?? []).sort();

  const [step, setStep] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dryResult, setDryResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm();
  const sSrs = Form.useWatch('s_srs', form);
  const resultColumns = getResultColumns(!!sSrs);

  const handleUpload = async () => {
    const originFiles = fileList.map((f) => f.originFileObj!);
    if (originFiles.length === 0) return;

    setUploading(true);
    try {
      let file: File;
      if (originFiles.length === 1) {
        file = originFiles[0];
      } else {
        const zip = new JSZip();
        for (const f of originFiles) {
          zip.file(f.name, f);
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        file = new File([blob], 'files.zip', { type: 'application/zip' });
      }

      const CHUNK_SIZE = 1_048_576; // 1 MB
      const formData = new FormData();
      formData.append('filename', file);
      await getAdminClient().provisioning.fileImport.postFileUpload(formData, { chunkSize: CHUNK_SIZE });
      setUploadedFile(file.name);
      message.success(originFiles.length > 1
        ? `${originFiles.length} files zipped and uploaded`
        : 'File uploaded');
      setStep(1);
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const handleDryRun = async () => {
    const values = form.getFieldsValue();
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

  const handleReset = () => {
    setStep(0);
    setUploadedFile(null);
    setFileList([]);
    setDryResult(null);
    setImportResult(null);
    setError(null);
    form.resetFields();
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>File Import</h2>
        {step > 0 && <Button onClick={handleReset}>Reset</Button>}
      </Space>
      <Steps current={step} style={{ marginBottom: 24 }} items={[
        { title: 'Upload' },
        { title: 'Configure' },
        { title: 'Preview' },
        { title: 'Done' },
      ]} />

      {step === 0 && (
        <Card>
          <Upload.Dragger
            multiple
            beforeUpload={() => false}
            fileList={fileList}
            onChange={({ fileList: newList }) => setFileList(newList)}
          >
            <p><UploadOutlined style={{ fontSize: 48, color: '#1890ff' }} /></p>
            <p>Click or drag file(s) to upload</p>
            <p style={{ color: '#888' }}>
              Supports CSV, GeoJSON, Shapefile (zip or individual files), GeoPackage, KML
            </p>
            <p style={{ color: '#888' }}>
              Multiple files will be zipped automatically
            </p>
          </Upload.Dragger>
          {fileList.length > 0 && (
            <Button
              type="primary"
              icon={<CloudUploadOutlined />}
              onClick={handleUpload}
              loading={uploading}
              style={{ marginTop: 16 }}
            >
              Upload {fileList.length > 1 ? `${fileList.length} files as zip` : 'file'}
            </Button>
          )}
        </Card>
      )}

      {step >= 1 && (
        <Card title={`File: ${uploadedFile}`} style={{ marginBottom: 16 }}>
          <Form form={form} layout="vertical">
            <Form.Item name="schema" label="Target Schema" rules={[{ required: true, message: 'Schema is required for import' }]}>
              <Select allowClear options={schemas.map((s) => ({ label: s, value: s }))} />
            </Form.Item>
            <Form.Item name="s_srs" label="Source SRS" tooltip="Fallback source SRS. Used only if the file doesn't contain projection information.">
              <Input placeholder="e.g. EPSG:25832" />
            </Form.Item>
            <Form.Item name="t_srs" label="Target SRS" tooltip="Fallback target SRS. Used if no authority name/code is available. Defaults to EPSG:4326.">
              <Input placeholder="EPSG:4326" />
            </Form.Item>
            <Form.Item name="append" label="Append" valuePropName="checked" tooltip="Append to existing table instead of creating a new one.">
              <Switch />
            </Form.Item>
            <Form.Item name="truncate" label="Truncate before append" valuePropName="checked" tooltip="Truncate table before appending. Only has effect if Append is enabled.">
              <Switch />
            </Form.Item>
            <Form.Item name="p_multi" label="Promote to multi geometry" valuePropName="checked" tooltip="Promote single geometries to multi-part geometries.">
              <Switch />
            </Form.Item>
            <Form.Item name="timestamp" label="Timestamp field" tooltip="Create a timestamp field with this name in the imported table.">
              <Input placeholder="e.g. created_at" />
            </Form.Item>
            <Form.Item name="x_possible_names" label="X / Longitude column names" tooltip="Potential column names for X/longitude. Only affects CSV files.">
              <Input placeholder="lon*,Lon*,x,X" />
            </Form.Item>
            <Form.Item name="y_possible_names" label="Y / Latitude column names" tooltip="Potential column names for Y/latitude. Only affects CSV files.">
              <Input placeholder="lat*,Lat*,y,Y" />
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

      {error && <Alert type="error" title={error} style={{ marginBottom: 12 }} />}

      {dryResult && step === 2 && (
        <Card title="Dry Run Result">
          <Table<FileProcessResponse>
            columns={resultColumns}
            dataSource={dryResult}
            rowKey="index"
            pagination={false}
            size="small"
          />
          <Button type="primary" icon={<CloudUploadOutlined />} onClick={handleImport} loading={importing} style={{ marginTop: 12 }}>
            Proceed with Import
          </Button>
        </Card>
      )}

      {importResult && step === 3 && (
        <Card title="Import Complete">
          <Alert type="success" title="File imported successfully" style={{ marginBottom: 12 }} />
          <Table<FileProcessResponse>
            columns={resultColumns}
            dataSource={importResult}
            rowKey="index"
            pagination={false}
            size="small"
          />
          <Button onClick={handleReset} style={{ marginTop: 12 }}>
            Import Another File
          </Button>
        </Card>
      )}
    </div>
  );
}
