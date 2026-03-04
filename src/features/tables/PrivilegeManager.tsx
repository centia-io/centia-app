import { useState, useEffect } from 'react';
import { Table, Segmented, Spin, message } from 'antd';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';

interface Props {
  schema: string;
  table: string;
}

export default function PrivilegeManager({ schema, table }: Props) {
  const [users, setUsers] = useState<any[]>([]);
  const [privData, setPrivData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const admin = getAdminClient();
    Promise.all([
      admin.provisioning.users.getUser(),
      admin.provisioning.privileges.getPrivileges(schema, table),
    ]).then(([usersRes, privRes]) => {
      const u = Array.isArray(usersRes) ? usersRes : [];
      setUsers(u);
      const privList = Array.isArray(privRes) ? privRes : [];
      const pMap: Record<string, string> = {};
      privList.forEach((p: any) => {
        pMap[p.subuser ?? p.name] = p.privilege ?? 'none';
      });
      setPrivData(pMap);
    }).catch((e) => {
      message.error(getErrorMessage(e));
    }).finally(() => setLoading(false));
  }, [schema, table]);

  const handleChange = async (subuser: string, privilege: string) => {
    try {
      await getAdminClient().provisioning.privileges.patchPrivileges(schema, table, {
        subuser,
        privilege: privilege as 'none' | 'read' | 'write',
      });
      setPrivData((prev) => ({ ...prev, [subuser]: privilege }));
      message.success(`Updated ${subuser} to ${privilege}`);
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    }
  };

  if (loading) return <Spin />;

  return (
    <Table
      dataSource={users}
      rowKey="name"
      size="small"
      pagination={false}
      columns={[
        { title: 'User', dataIndex: 'name', key: 'name' },
        {
          title: 'Privilege',
          key: 'privilege',
          render: (_: unknown, record: any) => (
            <Segmented
              size="small"
              options={['none', 'read', 'write']}
              value={privData[record.name] ?? 'none'}
              onChange={(v) => handleChange(record.name, v as string)}
            />
          ),
        },
      ]}
    />
  );
}
