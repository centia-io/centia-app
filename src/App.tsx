import { Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ConfigProvider, App as AntApp, Spin, Flex, theme } from 'antd';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthProvider';
import { routes } from './routes';
import { queryClient, initPersistence } from './data/queryClient';
import OfflineBanner from './components/OfflineBanner';
import { ThemeProvider, useTheme } from './theme/ThemeProvider';
import { setMessageInstance } from './utils/message';

// Initialize IndexedDB persistence if VITE_CLIENT_FIRST_PERSIST=true
initPersistence();

const router = createBrowserRouter(routes);

const Loading = () => (
  <Flex justify="center" align="center" style={{ minHeight: '100vh' }}>
    <Spin size="large" />
  </Flex>
);

function MessageCapture() {
  const { message } = AntApp.useApp();
  setMessageInstance(message);
  return null;
}

function ThemedApp() {
  const { resolved } = useTheme();
  return (
    <ConfigProvider
      theme={{
        algorithm: resolved === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: { colorPrimary: '#1677ff' },
      }}
    >
      <AntApp>
        <MessageCapture />
        <AuthProvider>
          <OfflineBanner />
          <Suspense fallback={<Loading />}>
            <RouterProvider router={router} />
          </Suspense>
        </AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ThemedApp />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
