import { ExclamationCircleOutlined } from '@ant-design/icons';
import { modal } from '../utils/modal';

export function confirmDelete(name: string, onOk: () => Promise<void> | void) {
  modal.confirm({
    title: 'Confirm Deletion',
    icon: <ExclamationCircleOutlined />,
    content: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
    okText: 'Delete',
    okType: 'danger',
    onOk,
  });
}
