import { Button, Card, Flex, Typography } from 'antd';
import { LoginOutlined } from '@ant-design/icons';
import { useAuth } from './AuthProvider';

export default function LoginPage() {
  const { signIn } = useAuth();
  return (
    <Flex justify="center" align="center" style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Card style={{ width: 360, textAlign: 'center' }}>
        <Typography.Title level={3}>Centia Admin</Typography.Title>
        <Typography.Paragraph type="secondary">
          Log in to manage your Centia BaaS instance
        </Typography.Paragraph>
        <Button type="primary" size="large" icon={<LoginOutlined />} onClick={signIn}>
          Login with Centia
        </Button>
      </Card>
    </Flex>
  );
}
