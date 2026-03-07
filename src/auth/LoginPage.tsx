import { useEffect, useRef } from 'react';
import { Button, Card, Flex, Spin, Typography } from 'antd';
import { LoginOutlined } from '@ant-design/icons';
import { useAuth } from './AuthProvider';

const AUTO_LOGIN_KEY = 'centia_auto_login_attempted';

export default function LoginPage() {
  const { signIn } = useAuth();
  const attempted = useRef(sessionStorage.getItem(AUTO_LOGIN_KEY) === '1');

  useEffect(() => {
    if (!attempted.current) {
      sessionStorage.setItem(AUTO_LOGIN_KEY, '1');
      signIn();
    }
  }, [signIn]);

  if (!attempted.current) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: '100vh', background: '#f0f2f5' }}>
        <Spin size="large" />
      </Flex>
    );
  }

  return (
    <Flex justify="center" align="center" style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Card style={{ width: 360, textAlign: 'center' }}>
        <img src="https://centia.io/img/centia-logo-dark.svg" alt="Centia.io" style={{ height: 40, marginBottom: 16 }} />
        <Typography.Title level={3}>Centia.io Admin</Typography.Title>
        <Typography.Paragraph type="secondary">
          Log in to manage your Centia.io BaaS instance
        </Typography.Paragraph>
        <Button type="primary" size="large" icon={<LoginOutlined />} onClick={signIn}>
          Login with Centia.io
        </Button>
      </Card>
    </Flex>
  );
}
