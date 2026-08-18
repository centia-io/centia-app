import { Button, Input, Space, Tooltip, Typography } from 'antd';
import { CopyOutlined, ExportOutlined } from '@ant-design/icons';
import { message } from '../../utils/message';

const { Text } = Typography;

export default function UrlField({ label, url, openUrl }: {
  label: string;
  url: string;
  /** When set, an open-in-browser link is shown (use only for URLs that work without headers). */
  openUrl?: string;
}) {
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    message.success('URL copied');
  };
  return (
    <div>
      <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
      <Space.Compact style={{ width: '100%' }}>
        <Input readOnly value={url} onFocus={(e) => e.target.select()} />
        <Tooltip title="Copy URL">
          <Button icon={<CopyOutlined />} onClick={copy} />
        </Tooltip>
        {openUrl && (
          <Tooltip title="Open in browser">
            <Button icon={<ExportOutlined />} href={openUrl} target="_blank" />
          </Tooltip>
        )}
      </Space.Compact>
    </div>
  );
}
