# WMS Layers & Styling under Map — Design

Date: 2026-08-10
Status: Approved (brainstorming session)

## Goal

Extend centia-app with the new `@centia-io/sdk` 0.2.2 capabilities `Layers` and `Ows`:
WMS layers can be styled (full MapServer-style editor) and viewed on the existing
**Map** page. `Wfs` is explicitly out of scope (follow-up task).

## Decisions (from brainstorming)

1. **Per-layer render mode** — each geometry table in the Map sidebar can render either
   as the existing GeoJSON vector layer or as a server-rendered WMS raster layer.
2. **Full styling editor** — layer properties, classes, styles AND labels (everything the
   Layers API supports).
3. **Editor lives on the Map page** — a drawer next to the live map; saving refreshes the
   WMS layer immediately.
4. **WMS only** — no WFS usage in this task (no WFS feature-info for popups).
5. **Single-image GetMap** — one viewport-sized image per WMS layer, re-fetched on
   `moveend`/resize/save. Not tiled.

## SDK surface used

- `getAdminClient().provisioning.layers` (`Layers`): `getLayer(key)`, `postLayer(layer)`.
  Layer key = `schema.table.geometry_column`. Granular class/style/label endpoints are
  NOT used by the editor (see Save model).
- `Ows.getOws` — only for WMS `GetCapabilities` (XML as text) during implementation to
  verify the WMS layer naming convention.
- WMS `GetMap` (binary PNG) is a documented SDK gap ("request those directly"): fetched
  with raw HTTP from `{VITE_CENTIA_HOST}/api/v4/ows/schema/{schema}` with an
  `Authorization: Bearer` header (token from `getStatus().getTokens()`).

## Architecture

New files (existing feature layout):

- `src/features/map/wmsImage.ts` — single-image WMS fetcher. Computes viewport BBOX in
  EPSG:3857 and canvas pixel size, requests GetMap
  (`SERVICE=WMS`, `SRS=EPSG:3857`, `FORMAT=image/png`, `TRANSPARENT=true`,
  `LAYERS=<wms layer name>`), returns an object URL. Handles AbortController
  cancellation and revokes stale object URLs.
- `src/features/map/LayerStyleDrawer.tsx` (+ small subcomponents) — the styling editor.
- `src/features/map/layerQueries.ts` — TanStack Query hooks wrapping
  `provisioning.layers`: `useLayer(key)` (queryKey `['layer', key]`) and a save mutation.

Changed files:

- `src/features/map/mapStore.ts` — `activeLayers` entries gain
  `renderMode: 'geojson' | 'wms'` (persisted); entries persisted before this change
  default to `'geojson'`. Transient state for which layer's drawer is open.
- `src/features/map/MapPage.tsx` — sidebar rows get a render-mode control and a style
  button; WMS-mode layers render as MapLibre `image` sources.

Data flow: editor reads/writes via the admin client; save invalidates `['layer', key]`
and bumps a per-layer version counter that triggers a WMS image re-fetch.

## WMS rendering (single-image)

- Switching a layer to WMS mode removes its GeoJSON source/layers and adds a MapLibre
  `image` source + `raster` layer, one per WMS-mode layer (per-layer toggling and
  z-order stay consistent with GeoJSON layers).
- Refresh triggers: `moveend`, map resize, successful style save. In-flight requests are
  aborted on a new trigger. During pan the previous image stays geographically anchored,
  so only newly exposed edges are blank until the refresh lands.
- WMS layer name for a table: verified against `GetCapabilities` during implementation
  (expected `schema.table` vs full layer key), then encoded as a mapping rule.
- Click-to-inspect popups remain vector-only; WMS-mode layers do not respond to clicks
  (raster is not queryable client-side; WFS/UTFGRID inspection out of scope).
- Per-row spinner while an image request is in flight. WMS errors often arrive as XML
  with HTTP 200: non-image content types are treated as errors and surfaced as an error
  badge/tooltip on the layer row.

## Styling editor UI

antd `Drawer` (`mask={false}`, width ≈ 440) opened from a paint-brush button on each
sidebar row; the map stays visible and interactive. Content:

- **Layer properties** — collapsible form covering the full `LayerProperties` set,
  grouped: rendering (opacity, tile format, offsite), scale limits (min/max/symbol
  scaledenom), labels (label_column, label scales, no-clip flags), theming
  (theme_column), caching/advanced (meta_tiles, meta_size, meta_buffer, ttl, cache,
  s3_tile_set, bands, lock). API stores numerics as strings with `''` = unset; inputs
  follow that convention.
- **Classes** — reorderable list (dnd-kit, already a dependency) with
  add/delete/duplicate. Each class expands to name, expression, min/max scaledenom,
  leader settings, and two tabs:
  - **Styles** — list per class; full `Style` fields (color, outlinecolor, width, size,
    symbol, angle, gap, opacity, pattern, linecap, geomtransform, min/max size, offsets,
    polar offsets). Colors via antd ColorPicker; stored color format verified at
    implementation and matched.
  - **Labels** — list per class; full `Label` fields (text/expression, font, fontweight,
    size, color, outlinecolor, position, buffer, repeatdistance, angle, scales,
    background, offsets, force/on flags).

## Save model & error handling

- **Draft + explicit Save**: drawer loads the def once (`getLayer`), edits stay in local
  draft state, Save sends the whole def via `postLayer` (properties + replace classes).
  One atomic write; Cancel/close discards. Granular patch endpoints are not used.
- `postLayer` replaces the classes array with the user's edited draft — a configuration
  write, not a destructive delete; no confirmation dialog. Class deletion commits only
  on Save.
- Unsaved-changes guard: closing the drawer with edits prompts "Discard changes?".
- Save errors shown inline in the drawer via `getErrorMessage`; draft preserved.
  Invalidation + WMS refresh only on success.
- Auth: fresh token per request via the existing `getStatus().getTokens()` pattern.

## Verification

No test infrastructure exists in the project; verification is manual in the browser
(dev server + Chrome DevTools): toggle GeoJSON/WMS per layer, edit properties, classes,
styles and labels, save, confirm the WMS image reflects changes; exercise error paths
(invalid expression, network failure, non-image WMS response).
