import { createTokenProvider } from '@centia-io/sdk';
import type { TokenProvider, TokenStore } from '@centia-io/sdk';
import { getCodeFlow, getStatus } from '../baas/client';

/**
 * Fresh-token provider for the AI agent. The agent server receives the raw
 * Bearer token, so unlike the SDK's own HTTP calls nothing refreshes it
 * automatically — this provider refreshes via the code flow's auth service
 * when the stored access token is near expiry, persisting back to the SDK's
 * gc2_tokens storage so the whole app benefits from the refresh.
 */
const TOKENS_KEY = 'gc2_tokens';

const store: TokenStore = {
  async get() {
    const t = getStatus().getTokens();
    return {
      token: t.accessToken || undefined,
      refresh_token: t.refreshToken || undefined,
    };
  },
  async set(patch) {
    const raw = window.localStorage.getItem(TOKENS_KEY);
    const cur = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    window.localStorage.setItem(
      TOKENS_KEY,
      JSON.stringify({
        ...cur,
        ...(patch.token !== undefined ? { accessToken: patch.token } : {}),
        ...(patch.refresh_token !== undefined ? { refreshToken: patch.refresh_token } : {}),
      }),
    );
  },
};

let provider: TokenProvider | null = null;

export function getAgentAccessToken(): Promise<string> {
  if (!provider) {
    provider = createTokenProvider({ store, authService: getCodeFlow().service });
  }
  return provider.getAccessToken();
}
