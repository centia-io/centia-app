// src/features/realtime/eventsApi.ts
//
// HTTP helpers for table event triggers.
// SDK gap — endpoint: GET/POST /api/v4/schemas/{schema}/tables/{table}/events
// Source: MCP tools getEvents/postEvents (both require schema + table)

import { getStatus } from '../../baas/client';
import { getAdminClient } from '../../baas/adminClient';

const host = () => import.meta.env.VITE_CENTIA_HOST;
const token = () => getStatus().getTokens().accessToken;

export interface TableEventStatus {
  table: string;
  enabled: boolean;
}

export async function getEventsStatus(schema: string): Promise<TableEventStatus[]> {
  // No bulk endpoint — fetch table list, then check each individually
  const res = await getAdminClient().provisioning.tables.getTable(schema, undefined, { namesOnly: true }) as any[];
  const tables: string[] = res.map((t: any) => t.name).sort();

  const results = await Promise.all(
    tables.map(async (table): Promise<TableEventStatus> => {
      try {
        const res = await fetch(
          `${host()}/api/v4/schemas/${schema}/tables/${table}/events`,
          { headers: { Authorization: `Bearer ${token()}` } },
        );
        if (!res.ok) return { table, enabled: false };
        const data = await res.json();
        return { table, enabled: !!data.enabled };
      } catch {
        return { table, enabled: false };
      }
    }),
  );

  return results;
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
