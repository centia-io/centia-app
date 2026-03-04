import { createCentiaAdminClient, isCentiaApiError } from '@centia-io/sdk';
import type { CentiaAdminClient } from '@centia-io/sdk';
import { getStatus } from './client';

let adminClient: CentiaAdminClient | null = null;

/**
 * Get the singleton CentiaAdminClient for provisioning operations.
 * Auth is injected via getAccessToken callback so the token is always fresh.
 */
export function getAdminClient(): CentiaAdminClient {
  if (!adminClient) {
    adminClient = createCentiaAdminClient({
      baseUrl: import.meta.env.VITE_CENTIA_HOST,
      auth: {
        getAccessToken: async () => getStatus().getTokens().accessToken,
      },
    });
  }
  return adminClient;
}

/** Extract a user-friendly error message from SDK or generic errors. */
export function getErrorMessage(error: unknown): string {
  if (isCentiaApiError(error)) {
    return error.message || `API error ${error.status}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
