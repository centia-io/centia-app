// src/features/realtime/RealtimePage.tsx
import { useState, useRef, useCallback } from 'react';
import { Button, Alert, Collapse, Space, theme } from 'antd';
import {
  ThunderboltOutlined,
  LinkOutlined,
  DisconnectOutlined,
} from '@ant-design/icons';
import { Ws } from '@centia-io/sdk';
import type { BatchMessage, SubscriptionRequest } from '@centia-io/sdk';
import EnableEvents from './EnableEvents';
import SubscriptionForm from './SubscriptionForm';
import EventLog from './EventLog';
import type { EventEntry } from './EventLog';

const MAX_EVENTS = 500;
const WS_HOST = 'wss://event.centia.io';

export default function RealtimePage() {
  const { token: themeToken } = theme.useToken();
  const wsRef = useRef<Ws | null>(null);
  const idCounter = useRef(0);

  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRequest[]>([]);
  const subscriptionsRef = useRef<SubscriptionRequest[]>([]);

  const handleBatch = useCallback((msg: BatchMessage) => {
    const now = new Date();
    const time = now.toLocaleTimeString('da-DK', { hour12: false });
    const newEvents: EventEntry[] = [];

    for (const [rel, data] of Object.entries(msg.batch[msg.db] ?? {})) {
      const hasOps = data.INSERT || data.UPDATE || data.DELETE;
      if (hasOps) {
        for (const op of ['INSERT', 'UPDATE', 'DELETE'] as const) {
          if (data[op]) {
            for (const row of data[op]!) {
              newEvents.push({
                id: ++idCounter.current,
                time,
                op,
                rel,
                data: Array.isArray(row) ? { values: row } : row,
              });
            }
          }
        }
      } else if (data.full_data) {
        // full_data without typed ops — show as UPDATE
        for (const row of data.full_data) {
          newEvents.push({
            id: ++idCounter.current,
            time,
            op: 'UPDATE',
            rel,
            data: row,
          });
        }
      }
    }

    setEvents((prev) => {
      const merged = [...prev, ...newEvents];
      return merged.length > MAX_EVENTS ? merged.slice(-MAX_EVENTS) : merged;
    });
  }, []);

  const connect = () => {
    setError(null);
    const ws = new Ws({
      host: WS_HOST,
      reconnect: true,
      reconnectInterval: 3000,
    });

    ws.on('open', () => {
      setConnected(true);
      // Re-register existing subscriptions on reconnect
      for (const sub of subscriptionsRef.current) {
        ws.subscribe(sub);
      }
    });
    ws.on('batch', handleBatch);
    ws.on('error', (msg) => {
      setError(`${msg.error}: ${msg.message}`);
    });
    ws.on('close', () => setConnected(false));

    ws.connect();
    wsRef.current = ws;
  };

  const disconnect = () => {
    wsRef.current?.disconnect();
    wsRef.current = null;
    setConnected(false);
  };

  const handleSubscribe = (sub: SubscriptionRequest) => {
    setSubscriptions((prev) => {
      const next = [...prev, sub];
      subscriptionsRef.current = next;
      return next;
    });
    if (wsRef.current?.connected) {
      wsRef.current.subscribe(sub);
    }
  };

  const handleRemoveSubscription = (id: string) => {
    setSubscriptions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      subscriptionsRef.current = next;
      return next;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Space style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>
          <ThunderboltOutlined style={{ marginRight: 8 }} />
          Realtime
        </h2>
        <Button
          type={connected ? 'default' : 'primary'}
          danger={connected}
          icon={connected ? <DisconnectOutlined /> : <LinkOutlined />}
          onClick={connected ? disconnect : connect}
        >
          {connected ? 'Disconnect' : 'Connect'}
        </Button>
        {connected && (
          <span style={{ color: '#52c41a', fontSize: 12 }}>
            ● Connected
          </span>
        )}
      </Space>

      {error && (
        <Alert
          type="error"
          message={error}
          closable
          onClose={() => setError(null)}
          style={{ marginBottom: 12 }}
        />
      )}

      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '300px 1fr',
          gap: 12,
          minHeight: 0,
        }}
      >
        {/* Left panel — configuration */}
        <div
          style={{
            overflow: 'auto',
            background: themeToken.colorBgContainer,
            borderRadius: 6,
            border: `1px solid ${themeToken.colorBorderSecondary}`,
            padding: 12,
          }}
        >
          <Collapse
            defaultActiveKey={['events', 'subscriptions']}
            ghost
            items={[
              {
                key: 'events',
                label: 'Enable Events',
                children: <EnableEvents />,
              },
              {
                key: 'subscriptions',
                label: 'Subscriptions',
                children: (
                  <SubscriptionForm
                    subscriptions={subscriptions}
                    onSubscribe={handleSubscribe}
                    onRemove={handleRemoveSubscription}
                    disabled={!connected}
                  />
                ),
              },
            ]}
          />
        </div>

        {/* Right panel — event log */}
        <div
          style={{
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <EventLog events={events} onClear={() => setEvents([])} />
        </div>
      </div>
    </div>
  );
}
