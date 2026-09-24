import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAdminClient } from '../baas/adminClient';
import { metaConfigToSchema } from '../data/metaConfig';

/**
 * The relation properties form, as configured on the GC2 server
 * (built-in metaConfig merged with the installation's own).
 */
export function useMetaConfigSchema() {
  const query = useQuery({
    queryKey: ['meta-config'],
    queryFn: async () => await getAdminClient().provisioning.metadata.getMetaConfig(),
    staleTime: Infinity,
  });
  const schema = useMemo(() => (query.data ? metaConfigToSchema(query.data) : undefined), [query.data]);
  return { schema, isLoading: query.isLoading, error: query.error };
}
