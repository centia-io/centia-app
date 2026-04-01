// src/features/realtime/eventsApi.ts
//
// HTTP helpers for table event triggers.
// SDK gap — endpoint: /api/v4/schemas/{schema}/tables/{table}/events
// Source: centia-realtime skill + MCP tool getEvents/postEvents

import { getStatus } from '../../baas/client';

const host = () => import.meta.env.VITE_CENTIA_HOST;
const token = () => getStatus().getTokens().accessToken;

export interface TableEventStatus {
  table: string;
  enabled: boolean;
}

export async function getEventsStatus(schema: string): Promise<TableEventStatus[]> {
  const res = await fetch(`${host()}/api/v4/schemas/${schema}/tables/events`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch events status: ${res.status}`);
  return res.json();
}

export async function setEventsEnabled(
  schema: string,
  table: string,
  enabled: boolean,
): Promise<void> {
  const res = await fetch(
    `${host()}/api/v4/schemas/${schema}/tables/${table}/events`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token()}`,
      },
      body: JSON.stringify({ enabled }),
    },
  );
  if (!res.ok) throw new Error(`Failed to set events: ${res.status}`);
}
