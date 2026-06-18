import { useState, useEffect } from 'react';
import { Modal, Select, Segmented, Spin, Space, Typography } from 'antd';
import { message } from '../../utils/message';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';

type Level = 'none' | 'read' | 'write';

interface BulkPrivilegeModalProps {
  open: boolean;
  schema: string;
  tables: string[];
  onClose: () => void;
  onApplied: () => void;
}

export default function BulkPrivilegeModal({ open, schema, tables, onClose, onApplied }: BulkPrivilegeModalProps) {
  const [users, setUsers] = useState<string[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [level, setLevel] = useState<Level>('read');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingUsers(true);
    getAdminClient().provisioning.users.getUser()
      .then((res) => {
        const list = Array.isArray(res) ? res : [];
        setUsers(list.map((u: any) => u.name).filter(Boolean));
      })
      .catch((e) => message.error(getErrorMessage(e)))
      .finally(() => setLoadingUsers(false));
  }, [open]);

  const reset = () => {
    setSelectedUsers([]);
    setLevel('read');
  };

  const handleCancel = () => {
    reset();
    onClose();
  };

  const handleApply = async () => {
    if (!selectedUsers.length) return;
    setSaving(true);
    const body = selectedUsers.map((subuser) => ({ subuser, privilege: level }));
    const admin = getAdminClient();
    const results = await Promise.allSettled(
      tables.map((table) => admin.provisioning.privileges.patchPrivileges(schema, table, body)),
    );
    const failed = tables.filter((_, i) => results[i].status === 'rejected');
    const ok = tables.length - failed.length;
    setSaving(false);
    if (ok > 0) message.success(`Privileges updated on ${ok} table${ok === 1 ? '' : 's'}`);
    if (failed.length) message.error(`${failed.length} table${failed.length === 1 ? '' : 's'} failed: ${failed.join(', ')}`);
    if (ok > 0) {
      reset();
      onApplied();
      onClose();
    }
  };

  const tableLabel = `${tables.length} table${tables.length === 1 ? '' : 's'}`;

  return (
    <Modal
      title={`Edit Privileges (${tableLabel})`}
      open={open}
      onCancel={handleCancel}
      onOk={handleApply}
      okText={`Apply to ${tableLabel}`}
      okButtonProps={{ disabled: !selectedUsers.length, loading: saving }}
      destroyOnClose
    >
      {loadingUsers ? (
        <Spin />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Typography.Text>Users</Typography.Text>
            <Select
              mode="multiple"
              allowClear
              style={{ width: '100%' }}
              placeholder="Select users"
              value={selectedUsers}
              onChange={setSelectedUsers}
              options={users.map((u) => ({ label: u, value: u }))}
            />
          </div>
          <div>
            <Typography.Text>Privilege</Typography.Text>
            <div>
              <Segmented options={['none', 'read', 'write']} value={level} onChange={(v) => setLevel(v as Level)} />
            </div>
          </div>
        </Space>
      )}
    </Modal>
  );
}
