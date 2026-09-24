import type { JSONSchema, PropertySchema } from '../components/SchemaForm';

/** GC2's metaConfig: the relation properties form, as fieldsets of fields. */
export interface MetaConfigField {
  name: string;
  type: 'text' | 'textarea' | 'checkbox' | 'combo' | 'checkboxgroup' | (string & {});
  title: string;
  values?: { name: string; value: string }[];
  default?: unknown;
}

export interface MetaConfigFieldset {
  fieldsetName: string;
  fields: MetaConfigField[];
}

/**
 * Convert metaConfig to the SchemaForm schema. Fieldsets become `group`,
 * name/value pairs become `enumNames`/`enum`, and a checkboxgroup keeps
 * GC2's comma-separated string storage. Unknown field types fall back to a
 * text field so a newer server config still renders.
 */
export function metaConfigToSchema(metaConfig: MetaConfigFieldset[]): JSONSchema {
  const properties: Record<string, PropertySchema> = {};
  for (const fieldset of metaConfig) {
    for (const f of fieldset.fields) {
      const p: PropertySchema = { type: 'string', title: f.title };
      switch (f.type) {
        case 'textarea':
          p.format = 'textarea';
          break;
        case 'checkbox':
          p.type = 'boolean';
          break;
        case 'checkboxgroup':
          p.format = 'checkboxgroup';
          p.enum = (f.values ?? []).map((v) => v.value);
          p.enumNames = (f.values ?? []).map((v) => v.name);
          break;
        case 'combo':
          p.enum = (f.values ?? []).map((v) => v.value);
          p.enumNames = (f.values ?? []).map((v) => v.name);
          break;
      }
      if (f.default !== undefined) p.default = f.default;
      p.group = fieldset.fieldsetName;
      properties[f.name] = p;
    }
  }
  return { type: 'object', properties };
}
