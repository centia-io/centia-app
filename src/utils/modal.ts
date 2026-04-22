import type { HookAPI } from 'antd/es/modal/useModal';

let _modal: HookAPI;

export function setModalInstance(m: HookAPI) {
  _modal = m;
}

export const modal: HookAPI = new Proxy({} as HookAPI, {
  get(_target, prop) {
    return (_modal as any)[prop];
  },
});
