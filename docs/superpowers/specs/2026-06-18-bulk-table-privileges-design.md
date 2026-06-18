# Bulk Table Privileges — Design

> Date: 2026-06-18
> Status: Approved

## Goal

Let an admin set privileges for one or more users across **multiple tables at once**,
instead of opening each table's Privileges tab individually.

## Context

- `TableListPage` (`src/features/tables/TableListPage.tsx`) already lists the tables of a
  single schema with multi-row selection (`rowSelection` → `selectedRows: string[]`) and an
  existing bulk action, **"Edit Metadata (N)"**, that opens a modal and applies changes to all
  selected tables.
- Per-table privilege editing lives in `PrivilegeManager` (`src/features/tables/PrivilegeManager.tsx`),
  which already has a single-table bulk action: set selected **users** to one level
  (`none` / `read` / `write`).
- The SDK method `patchPrivileges(schema, table, body)` operates on **one table** and accepts a
  single `{subuser, privilege}` or an **array** of them. It returns a `LocationResponse` (303).
  - Depends on the SDK 303 fix in `gc2-js-client` (`patchPrivileges` now uses
    `expectedStatus: 303`). Until that fixed SDK is published and installed in this app, every
    call throws `Unexpected status`. This feature requires the fixed SDK.

## Scope

All selected tables belong to the **same schema** (the page is scoped to one schema), so a
single user list (`getUser()`) covers every target table.

## UI

- A new button **"Edit Privileges (N)"** placed next to **"Edit Metadata (N)"** in the
  `TableListPage` action bar (`<Space>` at the top), shown only when `selectedRows.length > 0`.
- A new component **`src/features/tables/BulkPrivilegeModal.tsx`** holds the modal, keeping
  `TableListPage.tsx` (already large) from growing further.

### Modal contents

- On open: load the database users via `getAdminClient().provisioning.users.getUser()`.
- **Users:** multi-select (one or more subusers).
- **Level:** `Segmented` with `none` / `read` / `write`.
- Shows the number of target tables. Primary button: **"Apply to N tables"** (disabled while no
  user is selected or while saving).
- The modal does **not** show current per-table levels — they may differ per table, so this is a
  pure "set to" action (same principle as the existing bulk-metadata modal).

## Data flow

For each selected table, one API call:

```ts
patchPrivileges(schema, table, selectedUsers.map((subuser) => ({ subuser, privilege: level })))
```

All calls run concurrently via `Promise.allSettled`.

## Error handling — continue-on-error

- Failures do **not** abort the batch. Results are collected and reported:
  - All ok → `message.success("Privileges updated on N tables")`.
  - Partial → `message.success` for the succeeded count plus a `message.error`/warning listing the
    failed table names, e.g. `"1 table failed: lakes"`.
- On completion (any success), clear `selectedRows` and close the modal.

## Props / interface

```ts
interface BulkPrivilegeModalProps {
  open: boolean;
  schema: string;
  tables: string[];        // selectedRows
  onClose: () => void;
  onApplied: () => void;   // parent clears selection
}
```

The component owns its own user-list fetch, user/level form state, and saving state.

## Testing

`centia-app` has no test harness (no `test` script). Verification is **manual, in the running app**:
select multiple tables → Edit Privileges → pick users + level → Apply → confirm the success
message, and confirm via a table's Privileges tab that the level was applied. Also verify
partial-failure reporting (e.g. by including a table that rejects).

## Out of scope (YAGNI)

- Cross-schema bulk privileges.
- A per-user/per-table matrix grid.
- Showing/merging current per-table levels in the modal.
