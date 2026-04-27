import { useEffect, useState } from 'react';
import { Spin, Flex } from 'antd';
import { getCodeFlow } from '../baas/client';

export default function CallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('code') && !params.get('error')) {
      window.location.replace(`${import.meta.env.VITE_BASE_PATH || '/'}login`);
      return;
    }
    getCodeFlow()
      .redirectHandle()
      .then((ok: boolean) => {
        if (ok) {
          sessionStorage.removeItem('centia_auto_login_attempted');
          window.location.replace(import.meta.env.VITE_BASE_PATH || '/');
        } else {
          setError('Authentication failed');
        }
      })
      .catch((err: unknown) => setError(String(err)));
  }, []);

  if (error) return <div style={{ padding: 40 }}>{error}</div>;

  return (
    <Flex justify="center" align="center" style={{ minHeight: '100vh' }}>
      <Spin size="large" tip="Authenticating..." />
    </Flex>
  );
}
