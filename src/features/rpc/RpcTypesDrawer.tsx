import { Drawer, Spin, Alert } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { getAdminClient } from '../../baas/adminClient';
import CodeEditor from '../../components/CodeEditor';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function RpcTypesDrawer({ open, onClose }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['rpc-types'],
    queryFn: async () => await getAdminClient().provisioning.typeScript.getTypeScript(),
    staleTime: 60_000,
    enabled: open,
  });

  return (
    <Drawer title="TypeScript Interfaces" open={open} onClose={onClose} width={700}>
      {isLoading && <Spin />}
      {error && <Alert type="error" message={String(error)} />}
      {data && <CodeEditor value={data as string} readOnly height="calc(100vh - 120px)" />}
    </Drawer>
  );
}
