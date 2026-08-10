import { useEffect, useState } from 'react';
import { Alert, Button, Collapse, Drawer, Modal, Space, Spin } from 'antd';
import type { Layer } from '@centia-io/sdk';
import { message } from '../../utils/message';
import { getErrorMessage } from '../../baas/adminClient';
import { bumpWmsRefresh, closeStyleEditor, useMapStore } from './mapStore';
import { layerKeyOf, useLayer, useSaveLayer } from './layerQueries';
import { FieldGrid, LAYER_PROP_GROUPS } from './fieldDefs';
import ClassesEditor from './ClassesEditor';

export default function LayerStyleDrawer() {
  const { styleEditorLayer } = useMapStore();
  const key = styleEditorLayer ? layerKeyOf(styleEditorLayer) : null;
  const { data, isLoading, error } = useLayer(key);
  const saveLayer = useSaveLayer();
  const [draft, setDraft] = useState<Layer | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(data ? structuredClone(data) : null);
    setDirty(false);
  }, [data, key]);

  const update = (patch: Partial<Layer>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  };

  const close = () => {
    if (dirty) {
      Modal.confirm({
        title: 'Discard changes?',
        content: 'Unsaved styling changes will be lost.',
        okText: 'Discard',
        onOk: closeStyleEditor,
      });
    } else {
      closeStyleEditor();
    }
  };

  const save = async () => {
    if (!draft) return;
    try {
      await saveLayer.mutateAsync(draft);
      setDirty(false);
      message.success('Layer styling saved');
      bumpWmsRefresh();
    } catch (e) {
      message.error(getErrorMessage(e));
    }
  };

  return (
    <Drawer
      title={
        styleEditorLayer ? `Style: ${styleEditorLayer.schema}.${styleEditorLayer.table}` : 'Style'
      }
      open={!!styleEditorLayer}
      onClose={close}
      mask={false}
      width={440}
      extra={
        <Space>
          <Button onClick={close}>Cancel</Button>
          <Button type="primary" loading={saveLayer.isPending} disabled={!dirty} onClick={save}>
            Save
          </Button>
        </Space>
      }
    >
      {isLoading && (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      )}
      {error != null && <Alert type="error" message={getErrorMessage(error)} />}
      {draft && (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Collapse
            size="small"
            items={LAYER_PROP_GROUPS.map((g) => ({
              key: g.title,
              label: g.title,
              children: (
                <FieldGrid
                  fields={g.fields}
                  entity={(draft.properties ?? {}) as Record<string, unknown>}
                  onChange={(p) => update({ properties: { ...draft.properties, ...p } })}
                />
              ),
            }))}
          />
          <ClassesEditor classes={draft.classes ?? []} onChange={(classes) => update({ classes })} />
        </Space>
      )}
    </Drawer>
  );
}
