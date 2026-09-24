import { Alert, Spin } from 'antd';
import type { FormInstance } from 'antd';
import SchemaForm from './SchemaForm';
import { useMetaConfigSchema } from '../hooks/useMetaConfigSchema';
import { getErrorMessage } from '../baas/adminClient';

/** Relation properties form, built from the server's metaConfig. */
export default function MetaPropertiesForm(props: {
  form: FormInstance;
  enabledFields?: Record<string, boolean>;
  onEnabledChange?: (fields: Record<string, boolean>) => void;
}) {
  const { schema, isLoading, error } = useMetaConfigSchema();
  if (isLoading) return <Spin />;
  if (error) return <Alert type="error" showIcon message={`Could not load the properties form: ${getErrorMessage(error)}`} />;
  if (!schema) return null;
  return <SchemaForm schema={schema} {...props} />;
}
