// src/features/realtime/eventsApi.ts
//
// HTTP helpers for table event triggers.
// SDK gap — endpoint: PATCH /api/v4/schemas/{schema}/tables/{table}/events
// Source: MCP tool postEvents (requires schema + table)

import { getStatus } from '../../baas/client';
import { getAdminClient } from '../../baas/adminClient';

const host = () => import.meta.env.VITE_CENTIA_HOST;
const token = () => getStatus().getTokens().accessToken;

export interface TableEventStatus {
  table: string;
  enabled: boolean;
}

export async function getEventsStatus(schema: string): Promise<TableEventStatus[]> {
  const res = await getAdminClient().provisioning.tables.getTable(schema) as any[];
  return res
    .filter((t) => t._type === 'TABLE')
    .map((t) => ({ table: t.name, enabled: !!t._events }))
    .sort((a, b) => a.table.localeCompare(b.table));
}

export async function setEventsEnabled(
  schema: string,
  table: string,
  enabled: boolean,
): Promise<void> {
  const res = await fetch(
    `${host()}/api/v4/schemas/${schema}/tables/${table}/events`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token()}`,
      },
      body: JSON.stringify({ enabled }),
    },
  );
  if (!res.ok) throw new Error(`Failed to set events: ${res.status}`);
}
