import { Modal } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';

export function confirmDelete(name: string, onOk: () => Promise<void> | void) {
  Modal.confirm({
    title: 'Confirm Deletion',
    icon: <ExclamationCircleOutlined />,
    content: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
    okText: 'Delete',
    okType: 'danger',
    onOk,
  });
}
