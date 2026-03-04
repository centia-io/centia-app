import { Navigate } from 'react-router-dom';
import { Spin, Flex } from 'antd';
import { useAuth } from './AuthProvider';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuth, loading } = useAuth();

  if (loading) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: '100vh' }}>
        <Spin size="large" />
      </Flex>
    );
  }

  if (!isAuth) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
