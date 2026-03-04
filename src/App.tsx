import { Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ConfigProvider, Spin, Flex } from 'antd';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthProvider';
import { routes } from './routes';
import { queryClient, initPersistence } from './data/queryClient';
import OfflineBanner from './components/OfflineBanner';

// Initialize IndexedDB persistence if VITE_CLIENT_FIRST_PERSIST=true
initPersistence();

const router = createBrowserRouter(routes);

const Loading = () => (
  <Flex justify="center" align="center" style={{ minHeight: '100vh' }}>
    <Spin size="large" />
  </Flex>
);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider theme={{ token: { colorPrimary: '#1677ff' } }}>
        <AuthProvider>
          <OfflineBanner />
          <Suspense fallback={<Loading />}>
            <RouterProvider router={router} />
          </Suspense>
        </AuthProvider>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
