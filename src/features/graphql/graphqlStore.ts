import { createStore } from '../../utils/createStore';

interface GraphqlState {
  schema: string;
  query: string;
  variables: string;
  result: any;
  error: string | null;
  loading: boolean;
}

export const graphqlStore = createStore<GraphqlState>({
  schema: '',
  query: '{\n  \n}',
  variables: '{}',
  result: null,
  error: null,
  loading: false,
});

export const useGraphqlStore = graphqlStore.useStore;
