import { Outlet } from 'react-router-dom';

/**
 * Layout wrapper for spike pages.
 * QueryClientProvider is now provided at the App level.
 */
export default function SpikeLayout() {
  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <Outlet />
    </div>
  );
}
