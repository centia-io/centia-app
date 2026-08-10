import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isCentiaApiError } from '@centia-io/sdk';
import type { Layer } from '@centia-io/sdk';
import { getAdminClient } from '../../baas/adminClient';
import type { GeoTable } from './mapStore';

export function layerKeyOf(gt: GeoTable): string {
  return `${gt.schema}.${gt.table}.${gt.geomColumn}`;
}

export function useLayer(key: string | null) {
  return useQuery<Layer>({
    queryKey: ['layer', key],
    enabled: !!key,
    staleTime: 30_000,
    queryFn: async () => {
      try {
        return await getAdminClient().provisioning.layers.getLayer(key!);
      } catch (e) {
        if (isCentiaApiError(e) && e.status === 404) {
          return { name: key!, properties: {}, classes: [] };
        }
        throw e;
      }
    },
  });
}

export function useSaveLayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (layer: Layer) => getAdminClient().provisioning.layers.postLayer(layer),
    onSuccess: (_res, layer) => {
      queryClient.invalidateQueries({ queryKey: ['layer', layer.name] });
    },
  });
}
