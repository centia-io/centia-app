import { Button, Space, Typography } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import { useAuth } from '../auth/AuthProvider';

export default function HeaderBar() {
  const { user, signOut } = useAuth();
  const db = (user?.database as string) ?? '';

  return (
    <Space style={{ float: 'right' }}>
      {db && <Typography.Text type="secondary">{db}</Typography.Text>}
      <Button size="small" icon={<LogoutOutlined />} onClick={signOut}>
        Logout
      </Button>
    </Space>
  );
}
