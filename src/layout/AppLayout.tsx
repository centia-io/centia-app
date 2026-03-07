import { Layout, Typography } from 'antd';
import { Outlet } from 'react-router-dom';
import SideMenu from './SideMenu';
import HeaderBar from './HeaderBar';

const { Sider, Header, Content } = Layout;

export default function AppLayout() {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={220} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="https://centia.io/img/centia-logo-dark.svg" alt="Centia.io" style={{ height: 28 }} />
          <Typography.Title level={4} style={{ margin: 0 }}>Centia.io</Typography.Title>
        </div>
        <SideMenu />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', borderBottom: '1px solid #f0f0f0' }}>
          <HeaderBar />
        </Header>
        <Content style={{ padding: 24, background: '#f5f5f5', overflow: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
