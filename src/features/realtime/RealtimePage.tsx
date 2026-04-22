// src/features/realtime/RealtimePage.tsx
import { Button, Alert, Collapse, Space, theme } from 'antd';
import {
  ThunderboltOutlined,
  LinkOutlined,
  DisconnectOutlined,
} from '@ant-design/icons';
import EnableEvents from './EnableEvents';
import SubscriptionForm from './SubscriptionForm';
import EventLog from './EventLog';
import {
  useRealtimeStore,
  connect,
  disconnect,
  subscribe,
  removeSubscription,
  clearEvents,
  clearError,
} from './realtimeStore';

export default function RealtimePage() {
  const { token: themeToken } = theme.useToken();
  const { connected, error, events, subscriptions } = useRealtimeStore();

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
          onClose={clearError}
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
                    onSubscribe={subscribe}
                    onRemove={removeSubscription}
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
          <EventLog events={events} onClear={clearEvents} />
        </div>
      </div>
    </div>
  );
}
