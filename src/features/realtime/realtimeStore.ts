// src/features/realtime/realtimeStore.ts
//
// Module-level WebSocket + state. Connection survives page navigation,
// events keep streaming into the store while user is elsewhere.

import { Ws } from '@centia-io/sdk';
import type { BatchMessage, SubscriptionRequest } from '@centia-io/sdk';
import { createStore } from '../../utils/createStore';
import type { EventEntry } from './EventLog';

const MAX_EVENTS = 500;

interface RealtimeState {
  connected: boolean;
  error: string | null;
  events: EventEntry[];
  subscriptions: SubscriptionRequest[];
}

export const realtimeStore = createStore<RealtimeState>({
  connected: false,
  error: null,
  events: [],
  subscriptions: [],
});

export const useRealtimeStore = realtimeStore.useStore;

let ws: Ws | null = null;
let idCounter = 0;

function handleBatch(msg: BatchMessage) {
  const time = new Date().toLocaleTimeString('da-DK', { hour12: false });
  const newEvents: EventEntry[] = [];

  for (const [rel, data] of Object.entries(msg.batch[msg.db] ?? {})) {
    const hasOps = data.INSERT || data.UPDATE || data.DELETE;
    if (hasOps) {
      for (const op of ['INSERT', 'UPDATE', 'DELETE'] as const) {
        if (data[op]) {
          for (const row of data[op]!) {
            newEvents.push({
              id: ++idCounter,
              time,
              op,
              rel,
              data: Array.isArray(row) ? { values: row } : row,
            });
          }
        }
      }
    } else if (data.full_data) {
      for (const row of data.full_data) {
        newEvents.push({
          id: ++idCounter,
          time,
          op: 'UPDATE',
          rel,
          data: row,
        });
      }
    }
  }

  if (!newEvents.length) return;
  realtimeStore.set((prev) => {
    const merged = [...prev.events, ...newEvents];
    return { events: merged.length > MAX_EVENTS ? merged.slice(-MAX_EVENTS) : merged };
  });
}

export function connect() {
  if (ws) return;
  realtimeStore.set({ error: null });
  const instance = new Ws({
    host: import.meta.env.VITE_CENTIA_WS_HOST,
    reconnect: true,
    reconnectInterval: 3000,
  });

  instance.on('open', () => {
    realtimeStore.set({ connected: true });
    for (const sub of realtimeStore.get().subscriptions) {
      instance.subscribe(sub);
    }
  });
  instance.on('batch', handleBatch);
  instance.on('error', (msg) => {
    realtimeStore.set({ error: `${msg.error}: ${msg.message}` });
  });
  instance.on('close', () => realtimeStore.set({ connected: false }));

  instance.connect();
  ws = instance;
}

export function disconnect() {
  ws?.disconnect();
  ws = null;
  realtimeStore.set({ connected: false });
}

export function subscribe(sub: SubscriptionRequest) {
  realtimeStore.set((prev) => ({ subscriptions: [...prev.subscriptions, sub] }));
  try {
    if (ws?.connected) ws.subscribe(sub);
  } catch (e: any) {
    realtimeStore.set({ error: e.message ?? 'Failed to subscribe' });
  }
}

export function removeSubscription(id: string) {
  realtimeStore.set((prev) => ({
    subscriptions: prev.subscriptions.filter((s) => s.id !== id),
  }));
}

export function clearEvents() {
  realtimeStore.set({ events: [] });
}

export function clearError() {
  realtimeStore.set({ error: null });
}
