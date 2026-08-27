import { Drawer } from 'antd';
import { AgentChat } from '@centia-io/agent-ui';
import '@centia-io/agent-ui/styles.css';
import { getStatus } from '../baas/client';
import { queryClient } from '../data/queryClient';
import { bumpWmsRefresh } from '../features/map/mapStore';
import { useTheme } from '../theme/ThemeProvider';
import { agentStore, closeAgent } from './agentStore';
import { getAgentContext } from './agentContext';

const LAYER_TOOL = /Layer|Style|Label|Class/;
const WRITE_TOOL = /^(post|patch|delete)[A-Z]/;

export default function AgentDrawer() {
  const { open, messages } = agentStore.useStore();
  const { resolved } = useTheme();

  return (
    <Drawer
      title="Centia AI"
      placement="right"
      width={480}
      open={open}
      onClose={closeAgent}
      mask={false}
      styles={{ body: { padding: 0 } }}
      destroyOnClose={false}
    >
      <div data-ca-theme={resolved} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <AgentChat
          endpoint="/agent/api/chat"
          getToken={() => getStatus().getTokens().accessToken}
          getContext={getAgentContext}
          initialMessages={messages}
          onMessagesChange={(m) => agentStore.set({ messages: m })}
          onToolExecuted={(name) => {
            if (!WRITE_TOOL.test(name)) return;
            queryClient.invalidateQueries();
            if (LAYER_TOOL.test(name)) bumpWmsRefresh();
          }}
          locale="da"
        />
      </div>
    </Drawer>
  );
}
