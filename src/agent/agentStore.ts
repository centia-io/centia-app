import type { UiMessage } from '@mapcentia/gc2-agent-ui';
import { createStore } from '../utils/createStore';

interface AgentState {
  open: boolean;
  messages: UiMessage[];
}

export const agentStore = createStore<AgentState>({ open: false, messages: [] });

export const useAgentStore = agentStore.useStore;

export const openAgent = () => agentStore.set({ open: true });
export const closeAgent = () => agentStore.set({ open: false });
