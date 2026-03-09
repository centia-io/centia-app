import { useState, useEffect } from 'react';
import { Table, Segmented, Spin, Space, Button, theme } from 'antd';
import { message } from '../../utils/message';
import { EditOutlined } from '@ant-design/icons';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';

interface Props {
  schema: string;
  table: string;
}

export default function PrivilegeManager({ schema, table }: Props) {
  const { token } = theme.useToken();
  const [users, setUsers] = useState<any[]>([]);
  const [privData, setPrivData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);

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

  const handleBulkChange = async (privilege: string) => {
    if (!selectedRows.length) return;
    setBulkSaving(true);
    try {
      await getAdminClient().provisioning.privileges.patchPrivileges(schema, table,
        selectedRows.map((subuser) => ({
          subuser,
          privilege: privilege as 'none' | 'read' | 'write',
        })),
      );
      const updated: Record<string, string> = {};
      selectedRows.forEach((name) => { updated[name] = privilege; });
      setPrivData((prev) => ({ ...prev, ...updated }));
      message.success(`Updated ${selectedRows.length} users to ${privilege}`);
      setSelectedRows([]);
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setBulkSaving(false);
    }
  };

  const privColors = (level: string) => {
    const colors: Record<string, { bg: string; color: string }> = {
      none: { bg: token.colorFillTertiary, color: token.colorTextDisabled },
      read: { bg: token.colorInfoBg, color: token.colorInfo },
      write: { bg: token.colorSuccessBg, color: token.colorSuccess },
    };
    return colors[level] ?? colors.none;
  };

  if (loading) return <Spin />;

  return (
    <div>
      {selectedRows.length > 0 && (
        <Space style={{ marginBottom: 12 }}>
          <span>Set {selectedRows.length} users to:</span>
          <Segmented
            size="small"
            options={['none', 'read', 'write']}
            disabled={bulkSaving}
            onChange={(v) => handleBulkChange(v as string)}
          />
        </Space>
      )}
      <Table
        dataSource={users}
        rowKey="name"
        size="small"
        pagination={false}
        rowSelection={{
          selectedRowKeys: selectedRows,
          onChange: (keys) => setSelectedRows(keys as string[]),
        }}
        columns={[
          { title: 'User', dataIndex: 'name', key: 'name',
            sorter: (a: any, b: any) => (a.name ?? '').localeCompare(b.name ?? ''),
          },
          {
            title: 'Privilege',
            key: 'privilege',
            render: (_: unknown, record: any) => {
              const current = privData[record.name] ?? 'none';
              const { bg, color } = privColors(current);
              return (
                <Segmented
                  size="small"
                  options={['none', 'read', 'write']}
                  value={current}
                  onChange={(v) => handleChange(record.name, v as string)}
                  style={{ background: bg, fontWeight: 600, color }}
                />
              );
            },
          },
        ]}
      />
    </div>
  );
}
