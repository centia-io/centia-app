import { Menu } from 'antd';
import { useEffect, useRef } from 'react';
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
  ThunderboltOutlined,
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
    { key: '/realtime', icon: <ThunderboltOutlined />, label: 'Realtime' },
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

const sectionKeys = items
  .flatMap((g) => g.children.map((c) => c.key as string))
  .filter((k) => k !== '/')
  .sort((a, b) => b.length - a.length);

function findSection(pathname: string): string | undefined {
  for (const key of sectionKeys) {
    if (pathname === key || pathname.startsWith(key + '/')) return key;
  }
  return pathname === '/' ? '/' : undefined;
}

export default function SideMenu() {
  const navigate = useNavigate();
  const location = useLocation();
  const lastPathBySection = useRef<Record<string, string>>({});

  useEffect(() => {
    const section = findSection(location.pathname);
    if (section) {
      lastPathBySection.current[section] = location.pathname + location.search;
    }
  }, [location.pathname, location.search]);

  const handleClick = ({ key }: { key: string }) => {
    navigate(lastPathBySection.current[key] ?? key);
  };

  return (
    <Menu
      mode="inline"
      selectedKeys={[findSection(location.pathname) ?? location.pathname]}
      items={items}
      onClick={handleClick}
      style={{ borderRight: 0 }}
    />
  );
}
