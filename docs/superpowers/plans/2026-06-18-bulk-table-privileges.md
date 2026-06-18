# Bulk Table Privileges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin set a privilege level for one or more users across multiple selected tables in one action.

**Architecture:** A new self-contained `BulkPrivilegeModal` component fetches the database user list, lets the admin pick users + a level, then calls the per-table SDK method `patchPrivileges` once per selected table via `Promise.allSettled` (continue-on-error). It is wired into `TablesPanel` (inside `TableListPage.tsx`) as an "Edit Privileges (N)" bulk button next to the existing "Edit Metadata (N)".

**Tech Stack:** React + TypeScript, Ant Design (`Modal`, `Select`, `Segmented`), `@centia-io/sdk`, Vite.

## Global Constraints

- SDK: `@centia-io/sdk` **>= 0.1.2** (the version with the `patchPrivileges` 303 fix). Already installed in this repo (`node_modules/@centia-io/sdk` is 0.1.2). Earlier versions throw `Unexpected status` on every privilege PATCH.
- All runtime calls go through the SDK via `getAdminClient()` from `src/baas/adminClient.ts`. No raw `fetch`/`axios`.
- Use the project `message` util from `src/utils/message` (not `antd`'s `message` directly) and `getErrorMessage` from `src/baas/adminClient`.
- No automated test harness exists (`package.json` has no `test` script). The available automated gate is `npx tsc --noEmit`; behavior is verified manually in the running app (`npm run dev`).
- All selected tables belong to one schema (`TablesPanel` is schema-scoped; `schema` is a non-null `string` prop there).

---

### Task 1: BulkPrivilegeModal component

**Files:**
- Create: `src/features/tables/BulkPrivilegeModal.tsx`

**Interfaces:**
- Consumes (from SDK, already present):
  - `getAdminClient().provisioning.users.getUser(): Promise<UserInfo[]>` where each user has a `name: string`.
  - `getAdminClient().provisioning.privileges.patchPrivileges(schema: string, table: string, body: { subuser: string; privilege: 'none'|'read'|'write' }[]): Promise<{ location: string }>`.
- Produces (used by Task 2):
  ```ts
  interface BulkPrivilegeModalProps {
    open: boolean;
    schema: string;
    tables: string[];        // selected table names
    onClose: () => void;     // close the modal (parent owns `open`)
    onApplied: () => void;   // called after >=1 table succeeded (parent clears selection)
  }
  export default function BulkPrivilegeModal(props: BulkPrivilegeModalProps): JSX.Element
  ```

- [ ] **Step 1: Create the component file**

Create `src/features/tables/BulkPrivilegeModal.tsx` with this exact content:

```tsx
import { useState, useEffect } from 'react';
import { Modal, Select, Segmented, Spin, Space, Typography } from 'antd';
import { message } from '../../utils/message';
import { getAdminClient, getErrorMessage } from '../../baas/adminClient';

type Level = 'none' | 'read' | 'write';

interface BulkPrivilegeModalProps {
  open: boolean;
  schema: string;
  tables: string[];
  onClose: () => void;
  onApplied: () => void;
}

export default function BulkPrivilegeModal({ open, schema, tables, onClose, onApplied }: BulkPrivilegeModalProps) {
  const [users, setUsers] = useState<string[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [level, setLevel] = useState<Level>('read');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingUsers(true);
    getAdminClient().provisioning.users.getUser()
      .then((res) => {
        const list = Array.isArray(res) ? res : [];
        setUsers(list.map((u: any) => u.name).filter(Boolean));
      })
      .catch((e) => message.error(getErrorMessage(e)))
      .finally(() => setLoadingUsers(false));
  }, [open]);

  const reset = () => {
    setSelectedUsers([]);
    setLevel('read');
  };

  const handleCancel = () => {
    reset();
    onClose();
  };

  const handleApply = async () => {
    if (!selectedUsers.length) return;
    setSaving(true);
    const body = selectedUsers.map((subuser) => ({ subuser, privilege: level }));
    const admin = getAdminClient();
    const results = await Promise.allSettled(
      tables.map((table) => admin.provisioning.privileges.patchPrivileges(schema, table, body)),
    );
    const failed = tables.filter((_, i) => results[i].status === 'rejected');
    const ok = tables.length - failed.length;
    setSaving(false);
    if (ok > 0) message.success(`Privileges updated on ${ok} table${ok === 1 ? '' : 's'}`);
    if (failed.length) message.error(`${failed.length} table${failed.length === 1 ? '' : 's'} failed: ${failed.join(', ')}`);
    if (ok > 0) {
      reset();
      onApplied();
      onClose();
    }
  };

  const tableLabel = `${tables.length} table${tables.length === 1 ? '' : 's'}`;

  return (
    <Modal
      title={`Edit Privileges (${tableLabel})`}
      open={open}
      onCancel={handleCancel}
      onOk={handleApply}
      okText={`Apply to ${tableLabel}`}
      okButtonProps={{ disabled: !selectedUsers.length, loading: saving }}
      destroyOnClose
    >
      {loadingUsers ? (
        <Spin />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Typography.Text>Users</Typography.Text>
            <Select
              mode="multiple"
              allowClear
              style={{ width: '100%' }}
              placeholder="Select users"
              value={selectedUsers}
              onChange={setSelectedUsers}
              options={users.map((u) => ({ label: u, value: u }))}
            />
          </div>
          <div>
            <Typography.Text>Privilege</Typography.Text>
            <div>
              <Segmented options={['none', 'read', 'write']} value={level} onChange={(v) => setLevel(v as Level)} />
            </div>
          </div>
        </Space>
      )}
    </Modal>
  );
}
```

- [ ] **Step 2: Typecheck the new file compiles**

Run: `cd /home/mh/Source/centia-app && npx tsc --noEmit`
Expected: No new errors referencing `BulkPrivilegeModal.tsx`. (Pre-existing errors elsewhere, if any, are unchanged — confirm none mention this file.)

- [ ] **Step 3: Commit**

```bash
cd /home/mh/Source/centia-app
git add src/features/tables/BulkPrivilegeModal.tsx
git commit -m "feat(tables): add BulkPrivilegeModal component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Wire the bulk action into TablesPanel

**Files:**
- Modify: `src/features/tables/TableListPage.tsx`
  - Add import near the other local imports (around line 11-12).
  - Add `privOpen` state inside `TablesPanel` (component starts at line 79; other state is around lines 90-96).
  - Add the "Edit Privileges (N)" button in the top action `<Space>` (the "Edit Metadata" button is around line 410-413).
  - Render `<BulkPrivilegeModal/>` right after the "Bulk Edit Metadata" `<Drawer>` (closes around line 595-600).

**Interfaces:**
- Consumes: `BulkPrivilegeModal` from Task 1 (default export, props `{ open, schema, tables, onClose, onApplied }`).
- Inside `TablesPanel`, `schema: string` (prop), `selectedRows: string[]` and `setSelectedRows` are already in scope.

- [ ] **Step 1: Add the import**

In `src/features/tables/TableListPage.tsx`, after the line
`import { getAdminClient, getErrorMessage } from '../../baas/adminClient';`
add:

```tsx
import BulkPrivilegeModal from './BulkPrivilegeModal';
```

- [ ] **Step 2: Add modal-open state in TablesPanel**

In `TablesPanel`, immediately after the line
`const [selectedRows, setSelectedRows] = useState<string[]>([]);`
add:

```tsx
  const [privOpen, setPrivOpen] = useState(false);
```

- [ ] **Step 3: Add the "Edit Privileges" button**

Find the existing bulk button block in `TablesPanel`'s return:

```tsx
        {selectedRows.length > 0 && (
          <Button icon={<EditOutlined />} onClick={openBulkModal}>
            Edit Metadata ({selectedRows.length})
          </Button>
        )}
```

Immediately after that closing `)}`, add a second button:

```tsx
        {selectedRows.length > 0 && (
          <Button icon={<EditOutlined />} onClick={() => setPrivOpen(true)}>
            Edit Privileges ({selectedRows.length})
          </Button>
        )}
```

- [ ] **Step 4: Render the modal**

Find the closing `</Drawer>` of the "Bulk Edit Metadata" drawer (the `<Drawer title={`Bulk Edit Metadata ...`} open={bulkOpen} ...>`). Immediately after that `</Drawer>`, add:

```tsx
      <BulkPrivilegeModal
        open={privOpen}
        schema={schema}
        tables={selectedRows}
        onClose={() => setPrivOpen(false)}
        onApplied={() => setSelectedRows([])}
      />
```

- [ ] **Step 5: Typecheck**

Run: `cd /home/mh/Source/centia-app && npx tsc --noEmit`
Expected: No new errors referencing `TableListPage.tsx` or `BulkPrivilegeModal.tsx`.

- [ ] **Step 6: Manual verification in the app**

Run: `cd /home/mh/Source/centia-app && npm run dev`
Then in the browser:
1. Open a schema's Tables panel; check 2+ tables.
2. Click **Edit Privileges (N)** — modal opens, user list loads.
3. Select 1+ users, pick a level (e.g. `read`), click **Apply to N tables**.
4. Expect a success toast `Privileges updated on N tables`; selection clears; modal closes.
5. Open one of those tables → Privileges tab → confirm the selected users now show the chosen level.
6. (Partial-failure check) Repeat including a table you expect to reject (e.g. one you lack rights on) and confirm the `N table(s) failed: …` toast lists it while the others still succeed.

Confirm in the browser devtools Network tab that each privileges PATCH returns 303 and no `Unexpected status` toast appears.

- [ ] **Step 7: Commit**

```bash
cd /home/mh/Source/centia-app
git add src/features/tables/TableListPage.tsx
git commit -m "feat(tables): bulk-edit privileges across selected tables

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:**
  - Placement/trigger (button next to "Edit Metadata") → Task 2 Steps 1-3. ✓
  - New `BulkPrivilegeModal` component → Task 1. ✓
  - Multi-user select + single level → Task 1 Step 1 (`Select mode="multiple"` + `Segmented`). ✓
  - Loads users via `getUser()` on open → Task 1 Step 1 (`useEffect` on `open`). ✓
  - No current-level display ("set to" action) → Task 1 Step 1 (no per-table fetch). ✓
  - One `patchPrivileges` call per table with array body → Task 1 `handleApply`. ✓
  - Continue-on-error via `Promise.allSettled` + partial reporting → Task 1 `handleApply`. ✓
  - Clear selection + close on success → `onApplied`/`onClose` wired in Task 2 Step 4. ✓
  - Same-schema scope → uses `schema` prop directly. ✓
  - Manual in-app verification → Task 2 Step 6. ✓
- **Placeholder scan:** No TBD/TODO; all code blocks complete. ✓
- **Type consistency:** `BulkPrivilegeModalProps` shape identical in Task 1 definition and Task 2 usage (`open`, `schema`, `tables`, `onClose`, `onApplied`); `Level` union matches the SDK `privilege` field. ✓
