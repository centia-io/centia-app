import type { MessageInstance } from 'antd/es/message/interface';

let _message: MessageInstance;

export function setMessageInstance(m: MessageInstance) {
  _message = m;
}

export const message: MessageInstance = new Proxy({} as MessageInstance, {
  get(_target, prop) {
    return (_message as any)[prop];
  },
});
