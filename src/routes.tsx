import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

const LoginPage = lazy(() => import('./auth/LoginPage'));
const CallbackPage = lazy(() => import('./auth/CallbackPage'));
const AppLayout = lazy(() => import('./layout/AppLayout'));
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage'));
const SchemaListPage = lazy(() => import('./features/schemas/SchemaListPage'));
const TableListPage = lazy(() => import('./features/tables/TableListPage'));
const TableDetailPage = lazy(() => import('./features/tables/TableDetailPage'));
const SqlConsolePage = lazy(() => import('./features/sql/SqlConsolePage'));
const RpcListPage = lazy(() => import('./features/rpc/RpcListPage'));
const RpcFormPage = lazy(() => import('./features/rpc/RpcFormPage'));
const GraphqlExplorerPage = lazy(() => import('./features/graphql/GraphqlExplorerPage'));
const UserListPage = lazy(() => import('./features/users/UserListPage'));
const ClientListPage = lazy(() => import('./features/clients/ClientListPage'));
const RuleListPage = lazy(() => import('./features/rules/RuleListPage'));
const MetadataEditorPage = lazy(() => import('./features/metadata/MetadataEditorPage'));
const FileImportPage = lazy(() => import('./features/import/FileImportPage'));
const GitCommitPage = lazy(() => import('./features/git/GitCommitPage'));
const MapPage = lazy(() => import('./features/map/MapPage'));

const ProtectedRoute = lazy(() => import('./auth/ProtectedRoute'));

// Spike: TanStack DB client-first prototype (PR6)
const SpikeLayout = lazy(() => import('./spike/SpikeLayout'));
const SpikeSchemaPage = lazy(() => import('./spike/SpikeSchemaPage'));
const SpikeTablePage = lazy(() => import('./spike/SpikeTablePage'));

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/callback', element: <CallbackPage /> },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'schemas', element: <SchemaListPage /> },
      { path: 'schemas/:s', element: <TableListPage /> },
      { path: 'schemas/:s/tables/:t', element: <TableDetailPage /> },
      { path: 'sql', element: <SqlConsolePage /> },
      { path: 'rpc', element: <RpcListPage /> },
      { path: 'rpc/:method', element: <RpcFormPage /> },
      { path: 'graphql', element: <GraphqlExplorerPage /> },
      { path: 'users', element: <UserListPage /> },
      { path: 'clients', element: <ClientListPage /> },
      { path: 'rules', element: <RuleListPage /> },
      { path: 'metadata', element: <MetadataEditorPage /> },
      { path: 'import', element: <FileImportPage /> },
      { path: 'git', element: <GitCommitPage /> },
      { path: 'map', element: <MapPage /> },
    ],
  },
  // Spike: client-first prototype with TanStack DB (PR6)
  // Isolated routes — no impact on production pages
  {
    path: '/spike',
    element: (
      <ProtectedRoute>
        <SpikeLayout />
      </ProtectedRoute>
    ),
    children: [
      { path: 'schemas', element: <SpikeSchemaPage /> },
      { path: 'schemas/:s', element: <SpikeTablePage /> },
    ],
  },
];
