import { Menu } from 'antd';
import {
  DashboardOutlined,
  DatabaseOutlined,
  TableOutlined,
  CodeOutlined,
  ApiOutlined,
  FunctionOutlined,
  UserOutlined,
  KeyOutlined,
  SafetyOutlined,
  FileTextOutlined,
  CloudUploadOutlined,
  BranchesOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';

const items = [
  { type: 'group' as const, label: 'Overview', children: [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
  ]},
  { type: 'group' as const, label: 'Schema', children: [
    { key: '/schemas', icon: <DatabaseOutlined />, label: 'Schemas' },
  ]},
  { type: 'group' as const, label: 'Data', children: [
    { key: '/sql', icon: <CodeOutlined />, label: 'SQL Console' },
    { key: '/graphql', icon: <ApiOutlined />, label: 'GraphQL Explorer' },
  ]},
  { type: 'group' as const, label: 'API', children: [
    { key: '/rpc', icon: <FunctionOutlined />, label: 'JSON-RPC Methods' },
  ]},
  { type: 'group' as const, label: 'Access', children: [
    { key: '/users', icon: <UserOutlined />, label: 'Users' },
    { key: '/clients', icon: <KeyOutlined />, label: 'OAuth Clients' },
    { key: '/rules', icon: <SafetyOutlined />, label: 'Rules' },
  ]},
  { type: 'group' as const, label: 'Visualization', children: [
    { key: '/map', icon: <EnvironmentOutlined />, label: 'Map' },
  ]},
  { type: 'group' as const, label: 'Tools', children: [
    { key: '/metadata', icon: <FileTextOutlined />, label: 'Metadata' },
    { key: '/import', icon: <CloudUploadOutlined />, label: 'File Import' },
    { key: '/git', icon: <BranchesOutlined />, label: 'Git Commit' },
  ]},
];

export default function SideMenu() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Menu
      mode="inline"
      selectedKeys={[location.pathname]}
      items={items}
      onClick={({ key }) => navigate(key)}
      style={{ borderRight: 0 }}
    />
  );
}
