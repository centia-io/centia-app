import { Layout, Typography, theme } from 'antd';
import { Outlet } from 'react-router-dom';
import SideMenu from './SideMenu';
import HeaderBar from './HeaderBar';
import { useTheme } from '../theme/ThemeProvider';

const { Sider, Header, Content } = Layout;

export default function AppLayout() {
  const { token } = theme.useToken();
  const { resolved } = useTheme();
  const logoSrc = resolved === 'dark'
    ? 'https://centia.io/img/centia-logo.svg'
    : 'https://centia.io/img/centia-logo-dark.svg';

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <Sider width={220} trigger={null} style={{ background: token.colorBgContainer, borderRight: `1px solid ${token.colorBorderSecondary}`, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${token.colorBorderSecondary}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={logoSrc} alt="Centia.io" style={{ height: 28 }} />
          <Typography.Title level={4} style={{ margin: 0 }}>Centia.io</Typography.Title>
        </div>
        <div style={{ height: 'calc(100vh - 62px)', overflowY: 'auto' }}>
          <SideMenu />
        </div>
      </Sider>
      <Layout>
        <Header style={{ background: token.colorBgContainer, padding: '0 24px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          <HeaderBar />
        </Header>
        <Content style={{ padding: 24, background: token.colorBgLayout, overflow: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
