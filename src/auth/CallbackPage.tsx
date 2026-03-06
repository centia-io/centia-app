import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin, Flex } from 'antd';
import { getCodeFlow } from '../baas/client';

export default function CallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCodeFlow()
      .redirectHandle()
      .then((ok: boolean) => {
        if (ok) {
          navigate('/', { replace: true });
        } else {
          setError('Authentication failed');
        }
      })
      .catch((err: unknown) => setError(String(err)));
  }, [navigate]);

  if (error) return <div style={{ padding: 40 }}>{error}</div>;

  return (
    <Flex justify="center" align="center" style={{ minHeight: '100vh' }}>
      <Spin size="large" tip="Authenticating..." />
    </Flex>
  );
}
