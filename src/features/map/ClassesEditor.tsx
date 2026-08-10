import { useState } from 'react';
import { Button, Collapse, Popconfirm, Space, Tabs, theme, Typography } from 'antd';
import { CopyOutlined, DeleteOutlined, DownOutlined, HolderOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Label, LayerClass, Style } from '@centia-io/sdk';
import { CLASS_FIELDS, LABEL_FIELDS, STYLE_FIELDS, FieldGrid, type FieldDef } from './fieldDefs';

let nextTmpKey = 1;
const tmpKeys = new WeakMap<object, string>();

/** Stable list key: server id when present, else a client key minted per draft object. */
function keyOf(entity: { id?: string }): string {
  if (entity.id) return entity.id;
  let k = tmpKeys.get(entity);
  if (!k) {
    k = `new-${nextTmpKey++}`;
    tmpKeys.set(entity, k);
  }
  return k;
}

/** Carry the source object's client key over to its immutable replacement. */
function withKeyOf<T extends object>(source: object, next: T): T {
  const k = tmpKeys.get(source);
  if (k) tmpKeys.set(next, k);
  return next;
}

/** Generic add/edit/delete list for styles or labels of one class. */
function EntityList<T extends { id?: string; name?: string; sortid?: number }>({
  items,
  fields,
  itemLabel,
  onChange,
}: {
  items: T[];
  fields: FieldDef[];
  itemLabel: string;
  onChange: (items: T[]) => void;
}) {
  const update = (i: number, patch: Record<string, unknown>) => {
    onChange(items.map((it, j) => (j === i ? withKeyOf(it, { ...it, ...patch }) : it)));
  };
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Collapse
        size="small"
        items={items.map((it, i) => ({
          key: keyOf(it),
          label: it.name || `${itemLabel} ${i + 1}`,
          extra: (
            <Popconfirm
              title={`Delete this ${itemLabel.toLowerCase()}?`}
              onConfirm={() => onChange(items.filter((_, j) => j !== i))}
            >
              <Button
                size="small"
                type="text"
                icon={<DeleteOutlined />}
                onClick={(e) => e.stopPropagation()}
              />
            </Popconfirm>
          ),
          children: (
            <FieldGrid
              fields={fields}
              entity={it as Record<string, unknown>}
              onChange={(p) => update(i, p)}
            />
          ),
        }))}
      />
      <Button
        size="small"
        icon={<PlusOutlined />}
        onClick={() => onChange([...items, { sortid: (items.length + 1) * 10 } as T])}
      >
        Add {itemLabel.toLowerCase()}
      </Button>
    </Space>
  );
}

function SortableClassItem({
  id,
  cls,
  index,
  expanded,
  onToggle,
  onUpdate,
  onDelete,
  onDuplicate,
}: {
  id: string;
  cls: LayerClass;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<LayerClass>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const { token } = theme.useToken();
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: 6,
        background: token.colorBgContainer,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px' }}>
        <span {...attributes} {...listeners} style={{ cursor: 'grab', display: 'inline-flex' }}>
          <HolderOutlined />
        </span>
        <Button size="small" type="text" icon={expanded ? <DownOutlined /> : <RightOutlined />} onClick={onToggle} />
        <Typography.Text ellipsis style={{ flex: 1 }} onClick={onToggle}>
          {cls.name || `Class ${index + 1}`}
        </Typography.Text>
        <Button size="small" type="text" icon={<CopyOutlined />} onClick={onDuplicate} />
        <Popconfirm title="Delete this class?" onConfirm={onDelete}>
          <Button size="small" type="text" icon={<DeleteOutlined />} />
        </Popconfirm>
      </div>
      {expanded && (
        <div style={{ padding: '4px 8px 8px' }}>
          <FieldGrid
            fields={CLASS_FIELDS}
            entity={cls as Record<string, unknown>}
            onChange={onUpdate}
          />
          <Tabs
            size="small"
            style={{ marginTop: 8 }}
            items={[
              {
                key: 'styles',
                label: `Styles (${cls.styles?.length ?? 0})`,
                children: (
                  <EntityList<Style>
                    items={cls.styles ?? []}
                    fields={STYLE_FIELDS}
                    itemLabel="Style"
                    onChange={(styles) => onUpdate({ styles })}
                  />
                ),
              },
              {
                key: 'labels',
                label: `Labels (${cls.labels?.length ?? 0})`,
                children: (
                  <EntityList<Label>
                    items={cls.labels ?? []}
                    fields={LABEL_FIELDS}
                    itemLabel="Label"
                    onChange={(labels) => onUpdate({ labels })}
                  />
                ),
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}

export default function ClassesEditor({
  classes,
  onChange,
}: {
  classes: LayerClass[];
  onChange: (classes: LayerClass[]) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [expanded, setExpanded] = useState<string | null>(null);

  const updateClass = (i: number, patch: Partial<LayerClass>) => {
    onChange(classes.map((c, j) => (j === i ? withKeyOf(c, { ...c, ...patch }) : c)));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = classes.map(keyOf);
    const moved = arrayMove(classes, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    onChange(moved.map((c, i) => withKeyOf(c, { ...c, sortid: (i + 1) * 10 })));
  };

  const addClass = () => {
    onChange([
      ...classes,
      { name: `Class ${classes.length + 1}`, sortid: (classes.length + 1) * 10, styles: [], labels: [] },
    ]);
  };

  const duplicateClass = (i: number) => {
    const { id: _id, ...rest } = classes[i];
    onChange([
      ...classes,
      {
        ...structuredClone(rest),
        name: `${classes[i].name ?? 'Class'} (copy)`,
        sortid: (classes.length + 1) * 10,
        styles: (classes[i].styles ?? []).map(({ id: _sid, ...s }) => structuredClone(s)),
        labels: (classes[i].labels ?? []).map(({ id: _lid, ...l }) => structuredClone(l)),
      },
    ]);
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Typography.Text strong>Classes</Typography.Text>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={classes.map(keyOf)} strategy={verticalListSortingStrategy}>
          <Space direction="vertical" style={{ width: '100%' }} size={4}>
            {classes.map((c, i) => {
              const key = keyOf(c);
              return (
                <SortableClassItem
                  key={key}
                  id={key}
                  cls={c}
                  index={i}
                  expanded={expanded === key}
                  onToggle={() => setExpanded(expanded === key ? null : key)}
                  onUpdate={(patch) => updateClass(i, patch)}
                  onDelete={() => onChange(classes.filter((_, j) => j !== i))}
                  onDuplicate={() => duplicateClass(i)}
                />
              );
            })}
          </Space>
        </SortableContext>
      </DndContext>
      <Button size="small" icon={<PlusOutlined />} onClick={addClass}>
        Add class
      </Button>
    </Space>
  );
}
