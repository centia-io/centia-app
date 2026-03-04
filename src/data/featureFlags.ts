/**
 * Feature flags for client-first data layer rollout.
 *
 * Set VITE_CLIENT_FIRST_ENABLED=true in .env to enable client-first mode.
 * When disabled, pages use the existing useApi hook (no behavioral change).
 *
 * Set VITE_CLIENT_FIRST_PERSIST=true to enable IndexedDB persistence.
 * Cached query data survives page refreshes (no tokens are persisted).
 */
export const CLIENT_FIRST_ENABLED =
  import.meta.env.VITE_CLIENT_FIRST_ENABLED === 'true';

export const CLIENT_FIRST_PERSIST =
  import.meta.env.VITE_CLIENT_FIRST_PERSIST === 'true';
