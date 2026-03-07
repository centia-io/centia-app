import { Button, Space, Typography, Segmented } from 'antd';
import { LogoutOutlined, SunOutlined, MoonOutlined, DesktopOutlined } from '@ant-design/icons';
import { useAuth } from '../auth/AuthProvider';
import { useTheme } from '../theme/ThemeProvider';

type ThemeMode = 'light' | 'dark' | 'auto';

const themeOptions = [
  { value: 'light' as ThemeMode, icon: <SunOutlined /> },
  { value: 'auto' as ThemeMode, icon: <DesktopOutlined /> },
  { value: 'dark' as ThemeMode, icon: <MoonOutlined /> },
];

export default function HeaderBar() {
  const { user, signOut } = useAuth();
  const { mode, setMode } = useTheme();
  const db = (user?.database as string) ?? '';

  return (
    <Space style={{ float: 'right' }}>
      <Segmented
        size="small"
        value={mode}
        onChange={(v) => setMode(v as ThemeMode)}
        options={themeOptions}
      />
      {db && <Typography.Text type="secondary">{db}</Typography.Text>}
      <Button size="small" icon={<LogoutOutlined />} onClick={signOut}>
        Logout
      </Button>
    </Space>
  );
}
