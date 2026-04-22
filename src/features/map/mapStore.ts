import { createStore } from '../../utils/createStore';

export interface GeoTable {
  schema: string;
  table: string;
  geomColumn: string;
}

export interface Camera {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

interface MapState {
  selectedSchema: string | null;
  activeLayers: GeoTable[];
  camera: Camera | null;
}

export const mapStore = createStore<MapState>({
  selectedSchema: null,
  activeLayers: [],
  camera: null,
});

export const useMapStore = mapStore.useStore;

function sameLayer(a: GeoTable, b: GeoTable) {
  return a.schema === b.schema && a.table === b.table;
}

export function addActiveLayer(gt: GeoTable) {
  const current = mapStore.get().activeLayers;
  if (current.some((x) => sameLayer(x, gt))) return;
  mapStore.set({ activeLayers: [...current, gt] });
}

export function removeActiveLayer(gt: GeoTable) {
  const current = mapStore.get().activeLayers;
  mapStore.set({ activeLayers: current.filter((x) => !sameLayer(x, gt)) });
}
