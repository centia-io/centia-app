import { CodeFlow, Sql, Rpc, Gql, Meta, Stats, Status, Claims, Tables, Users } from '@centia-io/sdk';

let codeFlow: CodeFlow | null = null;
let sql: Sql | null = null;
let rpc: Rpc | null = null;
let meta: Meta | null = null;
let stats: Stats | null = null;
let status: Status | null = null;
let claims: Claims | null = null;
let tables: Tables | null = null;
let users: Users | null = null;

export function initClient() {
  const host = import.meta.env.VITE_CENTIA_HOST;
  const clientId = import.meta.env.VITE_CENTIA_CLIENT_ID;

  codeFlow = new CodeFlow({
    host,
    clientId,
    redirectUri: `${window.location.origin}/callback`,
  });

  sql = new Sql();
  rpc = new Rpc();
  meta = new Meta();
  stats = new Stats();
  status = new Status();
  claims = new Claims();
  tables = new Tables();
  users = new Users();
}

export function getCodeFlow() {
  if (!codeFlow) throw new Error('Client not initialized');
  return codeFlow;
}
export function getSql() {
  if (!sql) throw new Error('Client not initialized');
  return sql;
}
export function getRpc() {
  if (!rpc) throw new Error('Client not initialized');
  return rpc;
}
export function getGql(schema: string) {
  return new Gql(schema);
}
export function getMeta() {
  if (!meta) throw new Error('Client not initialized');
  return meta;
}
export function getStats() {
  if (!stats) throw new Error('Client not initialized');
  return stats;
}
export function getStatus() {
  if (!status) throw new Error('Client not initialized');
  return status;
}
export function getClaims() {
  if (!claims) throw new Error('Client not initialized');
  return claims;
}
export function getTables() {
  if (!tables) throw new Error('Client not initialized');
  return tables;
}
export function getUsers() {
  if (!users) throw new Error('Client not initialized');
  return users;
}
