import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAdminClient } from '../baas/adminClient';
import { metaConfigToSchema, type MetaConfigFieldset } from '../data/metaConfig';

/**
 * The relation properties form, as configured on the GC2 server
 * (built-in metaConfig merged with the installation's own).
 */
export function useMetaConfigSchema() {
  const query = useQuery({
    queryKey: ['meta-config'],
    // No SDK method for this endpoint yet — the SDK's own authenticated client bridges the gap.
    queryFn: async () =>
      await getAdminClient().http.request<MetaConfigFieldset[]>({ path: 'api/v4/meta-config', method: 'GET' }),
    staleTime: Infinity,
  });
  const schema = useMemo(() => (query.data ? metaConfigToSchema(query.data) : undefined), [query.data]);
  return { schema, isLoading: query.isLoading, error: query.error };
}
