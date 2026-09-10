import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isUptDataEntryClosedError, parseUptDataEntryStatus } from "../app/lib/upt-data-entry-access.ts";

const migrationUrl = new URL("../supabase/migrations/20260910120000_upt_data_entry_access_control.sql", import.meta.url);

test("status akses UPT memakai contract yang ketat", () => {
  assert.deepEqual(parseUptDataEntryStatus([{ enabled: false, updated_at: "2026-09-10T00:00:00Z" }]), {
    enabled: false,
    updatedAt: "2026-09-10T00:00:00Z",
  });
  assert.equal(parseUptDataEntryStatus([]), null);
  assert.equal(parseUptDataEntryStatus([{ enabled: "false", updated_at: "2026-09-10T00:00:00Z" }]), null);
  assert.equal(isUptDataEntryClosedError({ code: "42501", message: "upt_data_entry_closed" }), true);
  assert.equal(isUptDataEntryClosedError({ code: "42501", message: "other_error" }), false);
});

test("migration default ON, audit toggle, dan gate mutasi Station bersifat authoritative", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /enabled boolean not null default true/);
  assert.match(migration, /values \(true, true\)/);
  assert.match(migration, /perform public\.assert_upt_data_entry_enabled\(\)/);
  assert.match(migration, /'UPT_DATA_ENTRY_OPENED'/);
  assert.match(migration, /'UPT_DATA_ENTRY_CLOSED'/);
  assert.match(migration, /v_admin := public\.require_super_admin\(\)/);
  const releaseFunction = migration.match(/create or replace function public\.release_submission_lock[\s\S]*?end;\r?\n\$\$;/)?.[0] ?? "";
  assert.ok(releaseFunction);
  assert.doesNotMatch(releaseFunction, /assert_upt_data_entry_enabled/);
});

test("Station page fail-closed dan stale editor mengenali error akses", async () => {
  const [page, inventory, draftHook, adminControl] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/hooks/useServerDraft.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/UptDataEntryAccessControl.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /rpc\("get_upt_data_entry_status"\)/);
  assert.match(page, /if \(!access\).*AccountProblem/);
  assert.match(page, /if \(!access\.enabled\).*StationDataEntryClosed/);
  assert.match(draftHook, /isUptDataEntryClosedError/);
  assert.match(draftHook, /setIsEditing\(false\)/);
  assert.match(draftHook, /release_submission_lock/);
  assert.match(inventory, /if \(sync\.accessClosed && !isAdminEditor\) return <StationDataEntryClosed/);
  assert.match(adminControl, /set_upt_data_entry_enabled/);
  assert.match(adminControl, /Tutup pengisian UPT\?/);
});
