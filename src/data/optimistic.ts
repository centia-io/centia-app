import { queryClient } from './queryClient';

/**
 * Helper for optimistic cache mutations on TanStack Query caches.
 *
 * Cache shape is now bare arrays: T[] (no wrapper object).
 *
 * Pattern:
 *   const ctx = optimisticInsert(['rules'], newRule);
 *   try { await sdk.create(newRule); } catch { rollback(ctx); throw e; }
 *   queryClient.invalidateQueries({ queryKey: ['rules'] });
 */

interface OptimisticContext {
  queryKey: readonly unknown[];
  previous: unknown;
}

/**
 * Optimistically insert an item into a bare array cache.
 */
export function optimisticInsert<T>(
  queryKey: readonly unknown[],
  item: T,
): OptimisticContext {
  const previous = queryClient.getQueryData(queryKey);
  queryClient.setQueryData(queryKey, (old: any) => {
    if (!old) return old;
    return [...old, item];
  });
  return { queryKey, previous };
}

/**
 * Optimistically remove an item from a bare array cache by matching a key field.
 */
export function optimisticDelete(
  queryKey: readonly unknown[],
  keyField: string,
  keyValue: unknown,
): OptimisticContext {
  const previous = queryClient.getQueryData(queryKey);
  queryClient.setQueryData(queryKey, (old: any) => {
    if (!old) return old;
    return old.filter((item: any) => item[keyField] !== keyValue);
  });
  return { queryKey, previous };
}

/**
 * Optimistically update an item in a bare array cache by matching a key field.
 */
export function optimisticUpdate(
  queryKey: readonly unknown[],
  keyField: string,
  keyValue: unknown,
  patch: Record<string, unknown>,
): OptimisticContext {
  const previous = queryClient.getQueryData(queryKey);
  queryClient.setQueryData(queryKey, (old: any) => {
    if (!old) return old;
    return old.map((item: any) =>
      item[keyField] === keyValue ? { ...item, ...patch } : item,
    );
  });
  return { queryKey, previous };
}

/**
 * Rollback to previous cache state on mutation failure.
 */
export function rollback(ctx: OptimisticContext) {
  queryClient.setQueryData(ctx.queryKey, ctx.previous);
}
