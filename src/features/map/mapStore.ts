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
