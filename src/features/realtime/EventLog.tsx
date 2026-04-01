// src/features/realtime/EventLog.tsx
import { useState, useEffect, useRef } from 'react';
import { Button, Space, Badge, Tag } from 'antd';
import { ClearOutlined, PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';

export interface EventEntry {
  id: number;
  time: string;        // HH:mm:ss
  op: 'INSERT' | 'UPDATE' | 'DELETE';
  rel: string;         // schema.table
  data: Record<string, any>;
}

const OP_COLOR: Record<string, string> = {
  INSERT: '#52c41a',
  UPDATE: '#faad14',
  DELETE: '#ff4d4f',
};

export default function EventLog({
  events,
  onClear,
}: {
  events: EventEntry[];
  onClear: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paused) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length, paused]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Space style={{ marginBottom: 8 }}>
        <Badge count={events.length} overflowCount={9999} showZero color="#444" />
        <Button
          size="small"
          icon={paused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? 'Resume' : 'Pause'}
        </Button>
        <Button size="small" icon={<ClearOutlined />} onClick={onClear}>
          Clear
        </Button>
      </Space>

      <div
        style={{
          flex: 1,
          overflow: 'auto',
          background: '#0d1117',
          borderRadius: 6,
          padding: 8,
          fontFamily: 'monospace',
          fontSize: 12,
          lineHeight: '20px',
        }}
      >
        {events.length === 0 && (
          <div style={{ color: '#484f58', padding: 16, textAlign: 'center' }}>
            Waiting for events...
          </div>
        )}
        {events.map((e) => (
          <div key={e.id}>
            <div
              onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
              style={{
                display: 'flex',
                gap: 12,
                padding: '2px 6px',
                borderRadius: 3,
                cursor: 'pointer',
                background:
                  expandedId === e.id
                    ? 'rgba(255,255,255,0.06)'
                    : 'transparent',
              }}
            >
              <span style={{ color: '#484f58', minWidth: 60 }}>{e.time}</span>
              <span style={{ color: OP_COLOR[e.op], minWidth: 55, fontWeight: 600 }}>
                {e.op}
              </span>
              <span style={{ color: '#58a6ff' }}>{e.rel}</span>
              <span style={{ color: '#8b949e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {JSON.stringify(e.data)}
              </span>
            </div>
            {expandedId === e.id && (
              <pre
                style={{
                  margin: '2px 0 6px 78px',
                  padding: 8,
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 4,
                  color: '#c9d1d9',
                  fontSize: 11,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {JSON.stringify(e.data, null, 2)}
              </pre>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
