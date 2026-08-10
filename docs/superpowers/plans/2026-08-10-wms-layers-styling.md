# WMS Layers & Styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WMS layers can be styled (full MapServer-style editor: layer properties, classes, styles, labels) and viewed on the existing Map page, with a per-layer GeoJSON/WMS render-mode toggle.

**Architecture:** The Map sidebar gains a render-mode control per active layer; WMS mode renders a single viewport-sized GetMap image as a MapLibre `image` source, re-fetched on `moveend`/resize/save. A style drawer (antd `Drawer`, no mask) edits a local draft of the layer def and saves atomically via `provisioning.layers.postLayer`. Layer defs are cached with TanStack Query under `['layer', key]`.

**Tech Stack:** React 19, antd 6, maplibre-gl 5, @tanstack/react-query 5, @dnd-kit (already deps), `@centia-io/sdk` 0.2.2 (`Layers` via `getAdminClient().provisioning.layers`).

**Spec:** `docs/superpowers/specs/2026-08-10-wms-layers-styling-design.md`

## Global Constraints

- Use `@centia-io/sdk` for all runtime calls; raw HTTP is allowed ONLY for WMS GetMap (binary images are a documented SDK gap: the SDK's `Ows` wrapper says "request those directly").
- Never hardcode credentials; token always comes from `getStatus().getTokens().accessToken` at request time.
- No schema provisioning in runtime code.
- API convention: layer/style/label numeric values are STRINGS; empty string `''` means unset. Colors are hex strings like `#008000`. Style opacity is `'0'`–`'100'`. `sortid` is an integer.
- Layer key format: `schema.table.geometry_column`. WMS `LAYERS` param: `schema.table` (verified against GetCapabilities in Task 4; if wrong, fix `wmsLayerName` there — it is the single source of truth).
- The project has no test runner. Every task's check is `npx tsc --noEmit` (must exit 0 with no output); browser verification happens in Tasks 4, 7, and 8.
- WFS is out of scope. Click-to-inspect popups stay vector-only; WMS-mode layers do not respond to clicks.
- Commit after every task. Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File map

| File | Responsibility |
|---|---|
| `src/features/map/mapStore.ts` (modify) | Adds `renderMode` to active layers, style-drawer open state, WMS refresh counter |
| `src/features/map/wmsImage.ts` (create) | Mercator math, viewport→GetMap request, image object-URL fetch |
| `src/features/map/layerQueries.ts` (create) | TanStack Query hooks for `getLayer`/`postLayer` |
| `src/features/map/fieldDefs.tsx` (create) | Field descriptors for Style/Label/Class/LayerProperties + generic `FieldInput`/`FieldGrid` renderers |
| `src/features/map/ClassesEditor.tsx` (create) | Sortable class list with per-class Styles/Labels tabs |
| `src/features/map/LayerStyleDrawer.tsx` (create) | Drawer shell: draft state, save, unsaved-changes guard |
| `src/features/map/MapPage.tsx` (modify) | Render-mode UI, WMS image lifecycle, style button, drawer mount |

---

### Task 1: Store extensions (`mapStore.ts`)

**Files:**
- Modify: `src/features/map/mapStore.ts`

**Interfaces:**
- Consumes: `createStore` from `src/utils/createStore.ts` (`{ get, set, useStore }`; `set` accepts partial or updater function).
- Produces (used by Tasks 4 and 7):
  - `type RenderMode = 'geojson' | 'wms'`
  - `interface ActiveLayer extends GeoTable { renderMode: RenderMode }`
  - `MapState` gains `styleEditorLayer: GeoTable | null` and `wmsRefresh: number`
  - `setRenderMode(gt: GeoTable, renderMode: RenderMode): void`
  - `openStyleEditor(gt: GeoTable): void`, `closeStyleEditor(): void`, `bumpWmsRefresh(): void`
  - `addActiveLayer(gt: GeoTable)` unchanged signature, now stores `{ ...gt, renderMode: 'geojson' }`

The store is in-memory (survives route changes, not reloads), so no migration of old persisted entries is needed — every entry is created through `addActiveLayer`, which sets the default mode.

- [ ] **Step 1: Replace the file content**

```ts
import { createStore } from '../../utils/createStore';

export interface GeoTable {
  schema: string;
  table: string;
  geomColumn: string;
}

export type RenderMode = 'geojson' | 'wms';

export interface ActiveLayer extends GeoTable {
  renderMode: RenderMode;
}

export interface Camera {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

interface MapState {
  selectedSchema: string | null;
  activeLayers: ActiveLayer[];
  camera: Camera | null;
  /** Layer currently open in the style editor drawer. */
  styleEditorLayer: GeoTable | null;
  /** Bumped after a successful style save to trigger a WMS image refresh. */
  wmsRefresh: number;
}

export const mapStore = createStore<MapState>({
  selectedSchema: null,
  activeLayers: [],
  camera: null,
  styleEditorLayer: null,
  wmsRefresh: 0,
});

export const useMapStore = mapStore.useStore;

function sameLayer(a: GeoTable, b: GeoTable) {
  return a.schema === b.schema && a.table === b.table;
}

export function addActiveLayer(gt: GeoTable) {
  const current = mapStore.get().activeLayers;
  if (current.some((x) => sameLayer(x, gt))) return;
  mapStore.set({ activeLayers: [...current, { ...gt, renderMode: 'geojson' }] });
}

export function removeActiveLayer(gt: GeoTable) {
  const current = mapStore.get().activeLayers;
  mapStore.set({ activeLayers: current.filter((x) => !sameLayer(x, gt)) });
}

export function setRenderMode(gt: GeoTable, renderMode: RenderMode) {
  mapStore.set((s) => ({
    activeLayers: s.activeLayers.map((x) => (sameLayer(x, gt) ? { ...x, renderMode } : x)),
  }));
}

export function openStyleEditor(gt: GeoTable) {
  mapStore.set({ styleEditorLayer: gt });
}

export function closeStyleEditor() {
  mapStore.set({ styleEditorLayer: null });
}

export function bumpWmsRefresh() {
  mapStore.set((s) => ({ wmsRefresh: s.wmsRefresh + 1 }));
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no output. (`MapPage.tsx` still compiles because `ActiveLayer` extends `GeoTable`.)

- [ ] **Step 3: Commit**

```bash
git add src/features/map/mapStore.ts
git commit -m "feat(map): add render mode, style editor and WMS refresh state to map store"
```

---

### Task 2: WMS image fetcher (`wmsImage.ts`)

**Files:**
- Create: `src/features/map/wmsImage.ts`

**Interfaces:**
- Consumes: nothing app-internal (pure module; caller supplies host + token).
- Produces (used by Task 4):
  - `wmsLayerName(gt: { schema: string; table: string }): string` → `"schema.table"`
  - `interface WmsViewport { bbox: [number, number, number, number]; width: number; height: number; coordinates: [[number, number], [number, number], [number, number], [number, number]] }`
  - `computeWmsViewport(map: MapLibreMap, maxPixels?: number): WmsViewport`
  - `fetchWmsImage(opts: { host: string; schema: string; wmsLayer: string; token: string; viewport: WmsViewport; signal?: AbortSignal }): Promise<string>` → object URL; caller must `URL.revokeObjectURL` old URLs. Throws `Error` with the WMS `ServiceException` text when the response is not an image (WMS errors often come back as XML with HTTP 200).

- [ ] **Step 1: Create the file**

```ts
import type { Map as MapLibreMap } from 'maplibre-gl';

/** WMS layer name for a geometry table. Single source of truth for the GetMap LAYERS param. */
export function wmsLayerName(gt: { schema: string; table: string }): string {
  return `${gt.schema}.${gt.table}`;
}

const EARTH = 20037508.342789244;
/** Web-mercator latitude limit. */
const MAX_LAT = 85.06;

export function lngToMercX(lng: number): number {
  return (lng * EARTH) / 180;
}

export function latToMercY(lat: number): number {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const y = Math.log(Math.tan(((90 + clamped) * Math.PI) / 360)) / (Math.PI / 180);
  return (y * EARTH) / 180;
}

export interface WmsViewport {
  /** EPSG:3857 minx, miny, maxx, maxy. */
  bbox: [number, number, number, number];
  width: number;
  height: number;
  /** Image corners for a MapLibre image source: TL, TR, BR, BL (lng/lat). */
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
}

export function computeWmsViewport(map: MapLibreMap, maxPixels = 2048): WmsViewport {
  const b = map.getBounds();
  const west = b.getWest();
  const east = b.getEast();
  const south = Math.max(b.getSouth(), -MAX_LAT);
  const north = Math.min(b.getNorth(), MAX_LAT);

  const minx = lngToMercX(west);
  const maxx = lngToMercX(east);
  const miny = latToMercY(south);
  const maxy = latToMercY(north);

  const aspect = (maxy - miny) / (maxx - minx);
  let width = Math.min(map.getCanvas().clientWidth || 1024, maxPixels);
  let height = Math.round(width * aspect);
  if (height > maxPixels) {
    height = maxPixels;
    width = Math.round(height / aspect);
  }

  return {
    bbox: [minx, miny, maxx, maxy],
    width,
    height,
    coordinates: [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ],
  };
}

/**
 * Fetch a WMS GetMap image and return it as an object URL.
 * Raw HTTP by design: binary GetMap is a documented gap in the SDK's Ows wrapper.
 */
export async function fetchWmsImage(opts: {
  host: string;
  schema: string;
  wmsLayer: string;
  token: string;
  viewport: WmsViewport;
  signal?: AbortSignal;
}): Promise<string> {
  const { bbox, width, height } = opts.viewport;
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.1.1',
    REQUEST: 'GetMap',
    LAYERS: opts.wmsLayer,
    STYLES: '',
    SRS: 'EPSG:3857',
    BBOX: bbox.join(','),
    WIDTH: String(width),
    HEIGHT: String(height),
    FORMAT: 'image/png',
    TRANSPARENT: 'true',
  });
  const url = `${opts.host}/api/v4/ows/schema/${encodeURIComponent(opts.schema)}?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${opts.token}` },
    signal: opts.signal,
  });
  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || !contentType.startsWith('image/')) {
    const text = await res.text();
    const m = text.match(/<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/);
    throw new Error(m ? m[1].trim() : `WMS request failed (${res.status})`);
  }
  return URL.createObjectURL(await res.blob());
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/features/map/wmsImage.ts
git commit -m "feat(map): add single-image WMS GetMap fetcher"
```

---

### Task 3: Layer def query hooks (`layerQueries.ts`)

**Files:**
- Create: `src/features/map/layerQueries.ts`

**Interfaces:**
- Consumes: `getAdminClient` from `src/baas/adminClient.ts`; `isCentiaApiError`, `Layer` from `@centia-io/sdk`; `GeoTable` from `./mapStore`.
- Produces (used by Task 7):
  - `layerKeyOf(gt: GeoTable): string` → `"schema.table.geomColumn"`
  - `useLayer(key: string | null)` → TanStack query of `Layer`; a 404 (layer never configured) resolves to an empty def `{ name: key, properties: {}, classes: [] }`
  - `useSaveLayer()` → mutation taking a `Layer`, calling `postLayer`, invalidating `['layer', layer.name]` on success

- [ ] **Step 1: Create the file**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isCentiaApiError } from '@centia-io/sdk';
import type { Layer } from '@centia-io/sdk';
import { getAdminClient } from '../../baas/adminClient';
import type { GeoTable } from './mapStore';

export function layerKeyOf(gt: GeoTable): string {
  return `${gt.schema}.${gt.table}.${gt.geomColumn}`;
}

export function useLayer(key: string | null) {
  return useQuery<Layer>({
    queryKey: ['layer', key],
    enabled: !!key,
    staleTime: 30_000,
    queryFn: async () => {
      try {
        return await getAdminClient().provisioning.layers.getLayer(key!);
      } catch (e) {
        if (isCentiaApiError(e) && e.status === 404) {
          return { name: key!, properties: {}, classes: [] };
        }
        throw e;
      }
    },
  });
}

export function useSaveLayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (layer: Layer) => getAdminClient().provisioning.layers.postLayer(layer),
    onSuccess: (_res, layer) => {
      queryClient.invalidateQueries({ queryKey: ['layer', layer.name] });
    },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/features/map/layerQueries.ts
git commit -m "feat(map): add layer def query and save hooks"
```

---

### Task 4: WMS render mode on the Map page (`MapPage.tsx`)

**Files:**
- Modify: `src/features/map/MapPage.tsx`

**Interfaces:**
- Consumes: Task 1 store API (`ActiveLayer`, `RenderMode`, `setRenderMode`, `openStyleEditor`, `wmsRefresh` state), Task 2 (`computeWmsViewport`, `fetchWmsImage`, `wmsLayerName`), `getStatus` from `src/baas/client.ts`.
- Produces: sidebar rows with a `Segmented` GeoJSON/WMS control and a style button calling `openStyleEditor(gt)` (drawer itself lands in Task 7).

All edits below are to `src/features/map/MapPage.tsx`.

- [ ] **Step 1: Update imports and store destructure**

Replace the antd import (line 2) and the store import (line 8) with:

```ts
import { Spin, Alert, Switch, Typography, Select, Segmented, Button, Tooltip } from 'antd';
import { BgColorsOutlined, WarningOutlined } from '@ant-design/icons';
```

```ts
import {
  mapStore,
  useMapStore,
  addActiveLayer,
  removeActiveLayer,
  setRenderMode,
  openStyleEditor,
  type GeoTable,
  type ActiveLayer,
  type RenderMode,
} from './mapStore';
import { computeWmsViewport, fetchWmsImage, wmsLayerName } from './wmsImage';
import { getStatus } from '../../baas/client';
```

Note: `MapPage.tsx` already imports `getSql` from `../../baas/client` (line 6). Do not add a duplicate import — extend that line to `import { getSql, getStatus } from '../../baas/client';` and drop the separate `getStatus` import shown above.

Change the store destructure (line 86) to:

```ts
const { selectedSchema, activeLayers, wmsRefresh } = useMapStore();
```

- [ ] **Step 2: Add WMS state/refs and helpers**

After the `interactiveLayerIds` ref (line 84), add:

```ts
/** Per-WMS-source abort controllers and object URLs. */
const wmsAborts = useRef<Map<string, AbortController>>(new Map());
const wmsUrls = useRef<Map<string, string>>(new Map());
const [wmsErrors, setWmsErrors] = useState<Map<string, string>>(new Map());
```

Next to `layerId(gt)` (module level, after line 75), add:

```ts
function wmsSourceId(gt: GeoTable) {
  return `wms-${gt.schema}.${gt.table}`;
}
```

- [ ] **Step 3: Add `showWms` and `removeWms` callbacks**

After the existing `removeLayer` callback (line 190), add:

```ts
/** Fetch a viewport-sized GetMap image and add or update the image source for the layer. */
const showWms = useCallback(async (gt: GeoTable) => {
  const map = mapRef.current;
  if (!map) return;
  const wid = wmsSourceId(gt);

  wmsAborts.current.get(wid)?.abort();
  const ctrl = new AbortController();
  wmsAborts.current.set(wid, ctrl);

  setLayerLoading((prev) => new Set(prev).add(sourceId(gt)));
  try {
    const viewport = computeWmsViewport(map);
    const url = await fetchWmsImage({
      host: import.meta.env.VITE_CENTIA_HOST,
      schema: gt.schema,
      wmsLayer: wmsLayerName(gt),
      token: getStatus().getTokens().accessToken,
      viewport,
      signal: ctrl.signal,
    });
    const old = wmsUrls.current.get(wid);
    const src = map.getSource(wid) as maplibregl.ImageSource | undefined;
    if (src) {
      src.updateImage({ url, coordinates: viewport.coordinates });
    } else {
      map.addSource(wid, { type: 'image', url, coordinates: viewport.coordinates });
      map.addLayer({ id: wid, type: 'raster', source: wid, paint: { 'raster-fade-duration': 0 } });
    }
    wmsUrls.current.set(wid, url);
    if (old) URL.revokeObjectURL(old);
    setWmsErrors((prev) => {
      const next = new Map(prev);
      next.delete(wid);
      return next;
    });
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'AbortError')) {
      setWmsErrors((prev) => new Map(prev).set(wid, e instanceof Error ? e.message : String(e)));
    }
  } finally {
    setLayerLoading((prev) => {
      const next = new Set(prev);
      next.delete(sourceId(gt));
      return next;
    });
  }
}, []);

const removeWms = useCallback((gt: GeoTable) => {
  const map = mapRef.current;
  if (!map) return;
  const wid = wmsSourceId(gt);
  wmsAborts.current.get(wid)?.abort();
  wmsAborts.current.delete(wid);
  if (map.getLayer(wid)) map.removeLayer(wid);
  if (map.getSource(wid)) map.removeSource(wid);
  const url = wmsUrls.current.get(wid);
  if (url) {
    URL.revokeObjectURL(url);
    wmsUrls.current.delete(wid);
  }
  setWmsErrors((prev) => {
    const next = new Map(prev);
    next.delete(wid);
    return next;
  });
}, []);
```

- [ ] **Step 4: Wire WMS refresh into the map lifecycle**

Inside the mount effect:

a) After the existing `moveend` handler registration (line 247), add:

```ts
const refreshAllWms = () => {
  for (const al of mapStore.get().activeLayers) {
    if (al.renderMode === 'wms') showWms(al);
  }
};
map.on('moveend', refreshAllWms);
map.on('resize', refreshAllWms);
```

b) Replace the rehydrate loop in the `load` handler (lines 253–255) with:

```ts
for (const al of mapStore.get().activeLayers) {
  if (al.renderMode === 'wms') showWms(al);
  else addLayer(al, { fit: false });
}
```

c) In the effect cleanup (before `map.remove()`), add:

```ts
for (const ctrl of wmsAborts.current.values()) ctrl.abort();
wmsAborts.current.clear();
for (const url of wmsUrls.current.values()) URL.revokeObjectURL(url);
wmsUrls.current.clear();
```

d) Change the effect dependency array from `[addLayer]` to `[addLayer, showWms]`.

e) After the mount effect, add a new effect reacting to style saves (the counter is bumped by the drawer in Task 7):

```ts
useEffect(() => {
  if (!mapReady || wmsRefresh === 0) return;
  for (const al of mapStore.get().activeLayers) {
    if (al.renderMode === 'wms') showWms(al);
  }
}, [wmsRefresh, mapReady, showWms]);
```

- [ ] **Step 5: Update toggle and add mode-change handler**

Replace `handleToggle` (lines 265–276) with:

```ts
const handleToggle = useCallback(
  (gt: GeoTable, checked: boolean) => {
    if (checked) {
      addActiveLayer(gt);
      addLayer(gt, { fit: true });
    } else {
      const al = mapStore
        .get()
        .activeLayers.find((x) => x.schema === gt.schema && x.table === gt.table);
      removeActiveLayer(gt);
      if (al?.renderMode === 'wms') removeWms(gt);
      else removeLayer(gt);
    }
  },
  [addLayer, removeLayer, removeWms],
);

const handleModeChange = useCallback(
  (al: ActiveLayer, mode: RenderMode) => {
    if (al.renderMode === mode) return;
    setRenderMode(al, mode);
    if (mode === 'wms') {
      removeLayer(al);
      showWms(al);
    } else {
      removeWms(al);
      addLayer(al, { fit: false });
    }
  },
  [addLayer, removeLayer, showWms, removeWms],
);
```

- [ ] **Step 6: Update the sidebar row UI**

Replace the `visibleTables.map(...)` block (lines 329–352) with:

```tsx
{visibleTables.map((gt) => {
  const sid = sourceId(gt);
  const al = activeLayers.find((x) => x.schema === gt.schema && x.table === gt.table);
  const err = wmsErrors.get(wmsSourceId(gt));
  return (
    <div key={sid} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text ellipsis style={{ flex: 1, marginRight: 8 }}>
          {gt.table}
        </Text>
        {err && (
          <Tooltip title={err}>
            <WarningOutlined style={{ color: '#faad14', marginRight: 4 }} />
          </Tooltip>
        )}
        <Tooltip title="Edit WMS styling">
          <Button
            size="small"
            type="text"
            icon={<BgColorsOutlined />}
            onClick={() => openStyleEditor(gt)}
          />
        </Tooltip>
        <Switch
          size="small"
          checked={isActive(gt)}
          loading={layerLoading.has(sid)}
          disabled={!mapReady}
          onChange={(checked) => handleToggle(gt, checked)}
        />
      </div>
      {al && (
        <Segmented
          size="small"
          block
          value={al.renderMode}
          options={[
            { label: 'GeoJSON', value: 'geojson' },
            { label: 'WMS', value: 'wms' },
          ]}
          onChange={(v) => handleModeChange(al, v as RenderMode)}
        />
      )}
    </div>
  );
})}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 8: Verify WMS layer naming against GetCapabilities**

Start the dev server (`pnpm dev`), log into the app in Chrome, open the browser console and run (replace `<schema>` with a schema that has geometry tables; host from the app's env):

```js
const t = JSON.parse(localStorage.getItem('gc2_tokens')).accessToken;
const host = '<VITE_CENTIA_HOST value>';
fetch(`${host}/api/v4/ows/schema/<schema>?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetCapabilities`, {
  headers: { Authorization: `Bearer ${t}` },
})
  .then((r) => r.text())
  .then((x) => console.log([...x.matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1])));
```

Expected: layer names of the form `schema.table`. If the capability names instead include the geometry column (`schema.table.the_geom`), change `wmsLayerName` in `src/features/map/wmsImage.ts` to accept `GeoTable` and return `` `${gt.schema}.${gt.table}.${gt.geomColumn}` `` (callers already pass a full `GeoTable`), and note the finding in the commit message.

- [ ] **Step 9: Browser verification of rendering**

In the running app under Map: toggle a geometry table on (GeoJSON renders as before), switch its Segmented control to WMS.
Expected: the vector layer disappears and a server-rendered image appears in its place; panning/zooming re-fetches after `moveend` (previous image stays anchored during the gesture); switching back to GeoJSON restores the vector layer; toggling the layer off in WMS mode removes the image. A WMS failure (e.g. temporarily break `wmsLayerName` to a bogus name) shows the warning icon with the ServiceException text in its tooltip, and does not crash the page.

- [ ] **Step 10: Commit**

```bash
git add src/features/map/MapPage.tsx src/features/map/wmsImage.ts
git commit -m "feat(map): per-layer GeoJSON/WMS render mode with single-image GetMap"
```

---

### Task 5: Field descriptors and generic inputs (`fieldDefs.tsx`)

**Files:**
- Create: `src/features/map/fieldDefs.tsx`

**Interfaces:**
- Consumes: antd inputs only.
- Produces (used by Tasks 6 and 7):
  - `interface FieldDef { key: string; label: string; input: 'text' | 'number' | 'color' | 'select' | 'switch'; options?: string[] }`
  - `FieldInput({ def, value, onChange })` — renders one input; string convention: number/select/color emit `''` when cleared; switch emits boolean
  - `FieldGrid({ fields, entity, onChange })` — label/input grid; `onChange` receives a partial patch object
  - `STYLE_FIELDS: FieldDef[]`, `LABEL_FIELDS: FieldDef[]`, `CLASS_FIELDS: FieldDef[]`, `LAYER_PROP_GROUPS: { title: string; fields: FieldDef[] }[]`

Field `input` kinds follow the API docs: pure numerics are `number`; values that may hold `[column]` references or keywords like `auto` (size, angle, offsets, minfeaturesize) are `text`; booleans are `switch`; enums are `select`; colors are `color`. `sortid` and `id` are managed by list order / the server and are not form fields.

- [ ] **Step 1: Create the file**

```tsx
import { Fragment } from 'react';
import { ColorPicker, Input, InputNumber, Select, Switch, Typography } from 'antd';

export interface FieldDef {
  key: string;
  label: string;
  input: 'text' | 'number' | 'color' | 'select' | 'switch';
  options?: string[];
}

export function FieldInput({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (def.input) {
    case 'color':
      return (
        <ColorPicker
          size="small"
          allowClear
          value={typeof value === 'string' && value ? value : null}
          onChange={(c) => onChange(c.toHexString())}
          onClear={() => onChange('')}
        />
      );
    case 'number':
      return (
        <InputNumber
          size="small"
          style={{ width: '100%' }}
          value={typeof value === 'string' && value !== '' ? Number(value) : null}
          onChange={(v) => onChange(v === null ? '' : String(v))}
        />
      );
    case 'select':
      return (
        <Select
          size="small"
          style={{ width: '100%' }}
          allowClear
          value={(value as string) || undefined}
          options={(def.options ?? []).map((o) => ({ label: o, value: o }))}
          onChange={(v) => onChange(v ?? '')}
        />
      );
    case 'switch':
      return <Switch size="small" checked={!!value} onChange={(v) => onChange(v)} />;
    default:
      return (
        <Input
          size="small"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

export function FieldGrid({
  fields,
  entity,
  onChange,
}: {
  fields: FieldDef[];
  entity: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '140px 1fr',
        gap: '6px 8px',
        alignItems: 'center',
      }}
    >
      {fields.map((f) => (
        <Fragment key={f.key}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {f.label}
          </Typography.Text>
          <FieldInput def={f} value={entity[f.key]} onChange={(v) => onChange({ [f.key]: v })} />
        </Fragment>
      ))}
    </div>
  );
}

export const STYLE_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', input: 'text' },
  { key: 'color', label: 'Fill color', input: 'color' },
  { key: 'outlinecolor', label: 'Outline color', input: 'color' },
  { key: 'width', label: 'Line width', input: 'number' },
  { key: 'symbol', label: 'Symbol', input: 'text' },
  { key: 'size', label: 'Size', input: 'text' },
  { key: 'angle', label: 'Angle', input: 'text' },
  { key: 'gap', label: 'Gap', input: 'number' },
  { key: 'opacity', label: 'Opacity (0-100)', input: 'number' },
  { key: 'pattern', label: 'Dash pattern', input: 'text' },
  { key: 'linecap', label: 'Line cap', input: 'select', options: ['round', 'butt', 'square'] },
  {
    key: 'geomtransform',
    label: 'Geom transform',
    input: 'select',
    options: ['bbox', 'centroid', 'end', 'labelpnt', 'labelpoly', 'start', 'vertices'],
  },
  { key: 'minsize', label: 'Min size', input: 'number' },
  { key: 'maxsize', label: 'Max size', input: 'number' },
  { key: 'offsetx', label: 'Offset X', input: 'text' },
  { key: 'offsety', label: 'Offset Y', input: 'text' },
  { key: 'polaroffsetr', label: 'Polar offset radius', input: 'text' },
  { key: 'polaroffsetd', label: 'Polar offset angle', input: 'text' },
];

export const LABEL_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', input: 'text' },
  { key: 'on', label: 'Enabled', input: 'switch' },
  { key: 'text', label: 'Text', input: 'text' },
  { key: 'expression', label: 'Expression', input: 'text' },
  { key: 'font', label: 'Font', input: 'text' },
  {
    key: 'fontweight',
    label: 'Font weight',
    input: 'select',
    options: ['normal', 'bold', 'italic', 'bolditalic'],
  },
  { key: 'size', label: 'Size', input: 'text' },
  { key: 'color', label: 'Color', input: 'color' },
  { key: 'outlinecolor', label: 'Outline color', input: 'color' },
  {
    key: 'position',
    label: 'Position',
    input: 'select',
    options: ['auto', 'ul', 'uc', 'ur', 'cl', 'cc', 'cr', 'll', 'lc', 'lr'],
  },
  { key: 'buffer', label: 'Buffer', input: 'number' },
  { key: 'repeatdistance', label: 'Repeat distance', input: 'number' },
  { key: 'angle', label: 'Angle', input: 'text' },
  { key: 'backgroundcolor', label: 'Background color', input: 'color' },
  { key: 'backgroundpadding', label: 'Background padding', input: 'number' },
  { key: 'offsetx', label: 'Offset X', input: 'text' },
  { key: 'offsety', label: 'Offset Y', input: 'text' },
  { key: 'force', label: 'Force placement', input: 'switch' },
  { key: 'minscaledenom', label: 'Min scale denom', input: 'number' },
  { key: 'maxscaledenom', label: 'Max scale denom', input: 'number' },
  { key: 'maxsize', label: 'Max size', input: 'number' },
  { key: 'minfeaturesize', label: 'Min feature size', input: 'text' },
];

export const CLASS_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', input: 'text' },
  { key: 'expression', label: 'Expression', input: 'text' },
  { key: 'minscaledenom', label: 'Min scale denom', input: 'number' },
  { key: 'maxscaledenom', label: 'Max scale denom', input: 'number' },
  { key: 'leader', label: 'Leader line', input: 'switch' },
  { key: 'leader_gridstep', label: 'Leader grid step', input: 'number' },
  { key: 'leader_maxdistance', label: 'Leader max distance', input: 'number' },
  { key: 'leader_color', label: 'Leader color', input: 'color' },
];

export const LAYER_PROP_GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: 'Rendering',
    fields: [
      { key: 'opacity', label: 'Opacity (0-100)', input: 'number' },
      {
        key: 'geotype',
        label: 'Geometry type',
        input: 'select',
        options: ['Default', 'POINT', 'LINE', 'POLYGON'],
      },
      {
        key: 'format',
        label: 'Tile format',
        input: 'select',
        options: ['PNG', 'jpeg_low', 'jpeg_medium', 'jpeg_high'],
      },
      { key: 'offsite', label: 'Offsite color', input: 'color' },
      { key: 'polyline_no_clip', label: 'Polyline no clip', input: 'switch' },
    ],
  },
  {
    title: 'Scale limits',
    fields: [
      { key: 'minscaledenom', label: 'Min scale denom', input: 'number' },
      { key: 'maxscaledenom', label: 'Max scale denom', input: 'number' },
      { key: 'symbolscaledenom', label: 'Symbol scale denom', input: 'number' },
    ],
  },
  {
    title: 'Labels',
    fields: [
      { key: 'label_column', label: 'Label column', input: 'text' },
      { key: 'label_min_scale', label: 'Label min scale', input: 'number' },
      { key: 'label_max_scale', label: 'Label max scale', input: 'number' },
      { key: 'label_no_clip', label: 'Label no clip', input: 'switch' },
    ],
  },
  {
    title: 'Theming & clustering',
    fields: [
      { key: 'theme_column', label: 'Theme column', input: 'text' },
      { key: 'cluster', label: 'Cluster distance', input: 'number' },
    ],
  },
  {
    title: 'Caching & advanced',
    fields: [
      { key: 'meta_tiles', label: 'Meta tiles', input: 'text' },
      { key: 'meta_size', label: 'Meta size', input: 'number' },
      { key: 'meta_buffer', label: 'Meta buffer', input: 'number' },
      { key: 'ttl', label: 'Cache TTL', input: 'number' },
      { key: 'auto_expire', label: 'Auto expire', input: 'number' },
      { key: 'cache', label: 'Cache type', input: 'select', options: ['disk', 'sqlite', 's3', 'memcache'] },
      { key: 's3_tile_set', label: 'S3 tile set', input: 'text' },
      { key: 'bands', label: 'Bands', input: 'text' },
      { key: 'layers', label: 'Sub-layers', input: 'text' },
      { key: 'lock', label: 'Lock', input: 'switch' },
    ],
  },
];
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. If antd's `ColorPicker` `onClear` prop name differs in the installed antd 6, check `node_modules/antd/es/color-picker/interface.d.ts` and use the correct prop (fallback: `allowClear` + `onChangeComplete` with `c.cleared` check).

- [ ] **Step 3: Commit**

```bash
git add src/features/map/fieldDefs.tsx
git commit -m "feat(map): add data-driven style/label/class/property field definitions"
```

---

### Task 6: Classes editor (`ClassesEditor.tsx`)

**Files:**
- Create: `src/features/map/ClassesEditor.tsx`

**Interfaces:**
- Consumes: Task 5 (`FieldGrid`, `STYLE_FIELDS`, `LABEL_FIELDS`, `CLASS_FIELDS`, `FieldDef`); `LayerClass`, `Style`, `Label` types from `@centia-io/sdk`; dnd-kit (same pattern as `src/features/tables/ColumnEditor.tsx`).
- Produces (used by Task 7): `default export ClassesEditor({ classes, onChange }: { classes: LayerClass[]; onChange: (classes: LayerClass[]) => void })` — fully controlled; reorder rewrites `sortid = (index + 1) * 10`; new entities have no `id` (server assigns); duplicate strips `id`s.

- [ ] **Step 1: Create the file**

```tsx
import { useState } from 'react';
import { Button, Collapse, Popconfirm, Space, Tabs, Typography } from 'antd';
import { CopyOutlined, DeleteOutlined, DownOutlined, HolderOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Label, LayerClass, Style } from '@centia-io/sdk';
import { CLASS_FIELDS, LABEL_FIELDS, STYLE_FIELDS, FieldGrid, type FieldDef } from './fieldDefs';

function classKey(c: LayerClass, i: number): string {
  return c.id ?? `new-${i}`;
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
    onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  };
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Collapse
        size="small"
        items={items.map((it, i) => ({
          key: it.id ?? `new-${i}`,
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
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        border: '1px solid #f0f0f0',
        borderRadius: 6,
        background: '#fff',
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
    onChange(classes.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = classes.map(classKey);
    const moved = arrayMove(classes, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    onChange(moved.map((c, i) => ({ ...c, sortid: (i + 1) * 10 })));
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
        <SortableContext items={classes.map(classKey)} strategy={verticalListSortingStrategy}>
          <Space direction="vertical" style={{ width: '100%' }} size={4}>
            {classes.map((c, i) => {
              const key = classKey(c, i);
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/features/map/ClassesEditor.tsx
git commit -m "feat(map): add sortable classes editor with styles and labels tabs"
```

---

### Task 7: Style drawer and wiring (`LayerStyleDrawer.tsx` + `MapPage.tsx`)

**Files:**
- Create: `src/features/map/LayerStyleDrawer.tsx`
- Modify: `src/features/map/MapPage.tsx` (mount the drawer)

**Interfaces:**
- Consumes: Task 1 (`useMapStore().styleEditorLayer`, `closeStyleEditor`, `bumpWmsRefresh`), Task 3 (`layerKeyOf`, `useLayer`, `useSaveLayer`), Task 5 (`FieldGrid`, `LAYER_PROP_GROUPS`), Task 6 (`ClassesEditor`), `getErrorMessage` from `src/baas/adminClient.ts`, `message` from `src/utils/message.ts` (existing util, used the same way as in `src/features/tables/ColumnFormDrawer.tsx`).
- Produces: `default export LayerStyleDrawer()` — self-contained; reads open state from the store; rendered once at the end of `MapPage`'s JSX.

- [ ] **Step 1: Create `src/features/map/LayerStyleDrawer.tsx`**

```tsx
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
```

- [ ] **Step 2: Mount the drawer in `MapPage.tsx`**

Add the import:

```ts
import LayerStyleDrawer from './LayerStyleDrawer';
```

In the returned JSX, after the map area div (`<div ref={mapContainer} ... />`) and before the closing outer `</div>`, add:

```tsx
<LayerStyleDrawer />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Browser verification of the styling round-trip**

With `pnpm dev` running and a layer in WMS mode:
1. Click the paint-brush button on that layer's row → drawer opens next to the map (no mask; map still pannable).
2. Add a class, add a style, set a fill color → Save.
Expected: success message; the WMS image refreshes and shows the new color.
3. Reopen the drawer → the saved class/style round-trips (server-assigned ids present after refetch).
4. Change a color, click Cancel → "Discard changes?" confirm appears; Discard closes without saving.
5. Force a save error (e.g. set a class expression to obviously invalid syntax if the server rejects it, or briefly disconnect) → error appears via message, draft state is preserved, drawer stays open.

- [ ] **Step 5: Commit**

```bash
git add src/features/map/LayerStyleDrawer.tsx src/features/map/MapPage.tsx
git commit -m "feat(map): add WMS layer style drawer with draft editing and atomic save"
```

---

### Task 8: Final verification

**Files:** none new.

- [ ] **Step 1: Full typecheck and production build**

Run: `npx tsc --noEmit && pnpm build`
Expected: both succeed. (`vite build` must not pull Node-only SDK deps into the bundle — this was previously fixed; a regression would surface here.)

- [ ] **Step 2: End-to-end pass in the browser**

Walk the whole flow once against the dev server:
- GeoJSON mode unchanged: toggle on/off, popup on click, hover cursor.
- WMS mode: toggle, pan/zoom refresh, mode switch both directions, layer off in WMS mode.
- Editor: layer properties (each group renders), classes (add, duplicate, reorder by drag — verify saved order round-trips after Save + reopen), styles and labels (add/edit/delete), save + immediate WMS refresh, discard guard.
- Two layers active simultaneously, one GeoJSON + one WMS → both render; toggling one does not affect the other.
- WMS error path shows warning icon + tooltip, and recovers on next successful refresh.

- [ ] **Step 3: Fix anything found, commit fixes**

```bash
git add -A src/features/map
git commit -m "fix(map): address issues found in WMS end-to-end verification"
```

(Skip the commit if nothing was found.)
