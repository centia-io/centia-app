import { useSyncExternalStore } from 'react';

export function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();

  const subscribe = (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  };

  const get = (): T => state;

  const set = (
    partial: Partial<T> | ((prev: T) => Partial<T>),
  ): void => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...next };
    for (const l of listeners) l();
  };

  const useStore = (): T => useSyncExternalStore(subscribe, get, get);

  return { get, set, useStore };
}
