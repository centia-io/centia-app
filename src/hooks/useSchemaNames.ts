import { useQuery } from '@tanstack/react-query';
import { getAdminClient } from '../baas/adminClient';

export interface SchemaNameItem {
  name: string;
}

export function useSchemaNames() {
  return useQuery({
    queryKey: ['schemas', 'names'] as const,
    queryFn: async (): Promise<SchemaNameItem[]> => {
      return await getAdminClient().provisioning.schemas.getSchema(undefined, { namesOnly: true }) as SchemaNameItem[];
    },
    staleTime: 30_000,
  });
}

export function useTableNames(schema: string | undefined) {
  return useQuery({
    queryKey: ['schemas', 'names', schema, 'tables'] as const,
    queryFn: async (): Promise<SchemaNameItem[]> => {
      return await getAdminClient().provisioning.tables.getTable(schema!, undefined, { namesOnly: true }) as SchemaNameItem[];
    },
    enabled: !!schema,
    staleTime: 30_000,
  });
}
