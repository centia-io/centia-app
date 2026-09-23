import { createCollection } from '@tanstack/react-db';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import type { SchemaInfo } from '@centia-io/sdk';
import { getAdminClient } from '../../baas/adminClient';
import { queryClient } from '../queryClient';

export type SchemaItem = SchemaInfo;

/**
 * Schema collection backed by SDK provisioning.schemas.getSchema().
 *
 * - namesOnly=true: one catalog query instead of building every table's
 *   full definition — the listing still carries _table_count
 * - `getKey` uses the schema name as the unique key
 * - `onInsert` / `onDelete` persist mutations via SDK
 * - Optimistic updates are applied instantly by TanStack DB
 */
export const schemaCollection = createCollection(
  queryCollectionOptions({
    queryKey: ['schemas'] as const,
    queryFn: async (): Promise<SchemaItem[]> => {
      const admin = getAdminClient();
      return await admin.provisioning.schemas.getSchema(undefined, { namesOnly: true });
    },
    select: (data) => data ?? [],
    queryClient,
    getKey: (item) => item.name as string | number,

    onInsert: async ({ transaction }) => {
      const admin = getAdminClient();
      for (const mutation of transaction.mutations) {
        await admin.provisioning.schemas.postSchema({
          name: (mutation.modified as SchemaItem).name,
        });
      }
    },

    onDelete: async ({ transaction }) => {
      const admin = getAdminClient();
      for (const mutation of transaction.mutations) {
        await admin.provisioning.schemas.deleteSchema(
          String(mutation.key),
        );
      }
    },
  }),
);
