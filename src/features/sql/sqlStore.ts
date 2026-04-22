import { createStore } from '../../utils/createStore';

interface SqlState {
  query: string;
  format: string;
  selectedSchemas: string[];
  result: any;
  rawResult: string | null;
  error: string | null;
  loading: boolean;
}

export const sqlStore = createStore<SqlState>({
  query: 'SELECT 1 AS test;',
  format: 'json',
  selectedSchemas: [],
  result: null,
  rawResult: null,
  error: null,
  loading: false,
});

export const useSqlStore = sqlStore.useStore;
