import type { AppContext } from '@centia-io/agent-ui';

/** Pages contribute context under a key; the drawer merges all contributions. */
const contributions = new Map<string, Record<string, unknown>>();

export const setAgentPageContext = (key: string, data: Record<string, unknown>): void => {
  contributions.set(key, data);
};

export const clearAgentPageContext = (key: string): void => {
  contributions.delete(key);
};

export const getAgentContext = (): AppContext => {
  const data: Record<string, unknown> = { page: window.location.pathname };
  for (const [key, value] of contributions) data[key] = value;
  return { app: 'centia-app', data };
};
