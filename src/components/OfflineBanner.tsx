import { Alert } from 'antd';
import { WifiOutlined } from '@ant-design/icons';
import { useOnlineStatus } from '../data/useOnlineStatus';
import { CLIENT_FIRST_ENABLED } from '../data/featureFlags';

/**
 * Shows a fixed banner when the browser is offline.
 * Only renders when client-first mode is enabled (otherwise stale cache isn't relevant).
 */
export default function OfflineBanner() {
  const online = useOnlineStatus();

  if (!CLIENT_FIRST_ENABLED || online) return null;

  return (
    <Alert
      type="warning"
      banner
      icon={<WifiOutlined />}
      message="You are offline — showing cached data. Changes will sync when you reconnect."
      style={{ position: 'sticky', top: 0, zIndex: 1000 }}
    />
  );
}
