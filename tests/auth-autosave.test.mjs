import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  chooseInitialDraft,
  readScopedLocalDraft,
  scopedDraftKey,
  writeScopedLocalDraft,
} from "../app/lib/server-draft.ts";
import { logoutCurrentBrowser } from "../app/lib/local-logout.ts";

function payload(stationId = "station-a", siteId = "site-a", subtypeId = "subtype-a", inventory = {}) {
  return {
    schemaVersion: 1,
    stationId,
    siteId,
    siteSubtypeId: subtypeId,
    inventory,
    runwayAzimuth: "",
    siteMetadata: {},
  };
}

test("kunci localStorage memisahkan stasiun, site, dan subtipe", () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  };
  const firstKey = scopedDraftKey("station-a", "site-a", "subtype-a");
  const secondKey = scopedDraftKey("station-a", "site-b", "subtype-a");
  writeScopedLocalDraft(firstKey, { payload: payload(), serverVersion: 2, updatedAt: "2026-08-09T00:00:00Z" });
  assert.equal(readScopedLocalDraft(firstKey)?.serverVersion, 2);
  assert.equal(readScopedLocalDraft(secondKey), null);
});

test("draf lokal dipakai saat server kosong dan tidak menang diam-diam saat tertinggal", () => {
  const localPayload = payload("station-a", "site-a", "subtype-a", { Sensor: [{ id: "local" }] });
  const serverPayload = payload("station-a", "site-a", "subtype-a", { Sensor: [{ id: "server" }] });
  const local = { payload: localPayload, serverVersion: 1, updatedAt: "2026-08-09T00:00:00Z" };
  assert.equal(chooseInitialDraft(local, null, 0).kind, "local");
  assert.equal(chooseInitialDraft(local, serverPayload, 2).kind, "conflict");
});

test("logout hanya mengakhiri session browser saat ini setelah mencoba release lock", async () => {
  const sessionA = { authenticated: true };
  const sessionB = { authenticated: true };
  const calls = [];
  await logoutCurrentBrowser({
    releaseLock: async () => { calls.push("release-a"); },
    signOut: async (options) => {
      calls.push(`signout-${options.scope}`);
      if (options.scope === "local") sessionA.authenticated = false;
    },
  });
  assert.deepEqual(calls, ["release-a", "signout-local"]);
  assert.equal(sessionA.authenticated, false);
  assert.equal(sessionB.authenticated, true);
});

test("logout tetap selesai saat release lock gagal", async () => {
  let signedOut = false;
  await logoutCurrentBrowser({
    releaseLock: async () => { throw new Error("offline"); },
    signOut: async ({ scope }) => { signedOut = scope === "local"; },
  });
  assert.equal(signedOut, true);
});

test("logout tidak menunggu release lock yang macet", async () => {
  let signedOut = false;
  await logoutCurrentBrowser({
    releaseLock: () => new Promise(() => {}),
    signOut: async ({ scope }) => { signedOut = scope === "local"; },
    releaseTimeoutMs: 1,
  });
  assert.equal(signedOut, true);
});

test("migration membatasi stasiun dan menerapkan lock serta optimistic version", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260810010000_station_auth_autosave.sql", import.meta.url), "utf8");
  assert.match(sql, /site\.station_id = v_station_id/);
  assert.match(sql, /subtype\.site_type_id = site\.site_type_id/);
  assert.match(sql, /interval '5 minutes'/);
  assert.match(sql, /for update/);
  assert.match(sql, /v_submission\.version <> p_expected_version/);
  assert.match(sql, /'version_conflict'/);
  assert.match(sql, /'lock_lost'/);
  assert.match(sql, /unique \(station_id, site_id, site_subtype_id\)/);
  assert.match(sql, /revoke all on table public\.submissions from public, anon, authenticated/);
});

test("autosave memakai debounce, session tab, dan touch berbasis aktivitas", async () => {
  const [hook, storage] = await Promise.all([
    readFile(new URL("../app/hooks/useServerDraft.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/server-draft.ts", import.meta.url), "utf8"),
  ]);
  assert.match(hook, /get_submission_state/);
  assert.match(hook, /open_submission/);
  assert.match(hook, /startEditing/);
  assert.match(hook, /5_000/);
  assert.match(hook, /18_000/);
  assert.match(hook, /Date\.now\(\) - lastTouchRef\.current < 45_000/);
  assert.doesNotMatch(hook, /setInterval/);
  assert.match(storage, /sessionStorage\.getItem\(TAB_SESSION_STORAGE_KEY\)/);
  assert.match(storage, /crypto\.randomUUID\(\)/);
});

test("browse mode tidak acquire lock atau autosave server sebelum edit eksplisit", async () => {
  const hook = await readFile(new URL("../app/hooks/useServerDraft.ts", import.meta.url), "utf8");
  assert.match(hook, /client\.rpc\("get_submission_state"/);
  assert.match(hook, /Browse changes only read state; they must not acquire or release locks/);
  assert.match(hook, /const startEditing = useCallback/);
  assert.match(hook, /if \(!isEditing \|\| !stationId/);
  assert.match(hook, /if \(!isEditing \|\| latestPayload\) return "read-only"/);
});

test("edit mode dimulai eksplisit dan gagal menjadi read-only saat lock milik sesi lain", async () => {
  const hook = await readFile(new URL("../app/hooks/useServerDraft.ts", import.meta.url), "utf8");
  const startEditing = hook.match(/const startEditing = useCallback[\s\S]*?\}, \[onRemotePayload, operatorName, scope\]\);/)?.[0] ?? "";
  assert.match(startEditing, /open_submission/);
  assert.match(startEditing, /setIsEditing\(true\)/);
  assert.match(startEditing, /setStatus\("editing"\)/);
  assert.match(startEditing, /setStatus\("read-only"\)/);
  assert.match(startEditing, /setCanTakeover\(Boolean\(row\.can_takeover\)\)/);
});

test("manual save, finish edit, dan download dirty state memakai save segera", async () => {
  const inventory = await readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8");
  assert.match(inventory, /async function saveManual\(\)/);
  assert.match(inventory, /const result = await sync\.saveNow\(\)/);
  assert.match(inventory, /async function finishEditing\(\)/);
  assert.match(inventory, /const result = await sync\.finishEditing\(\)/);
  assert.match(inventory, /async function saveBeforeDownload\(\)/);
  assert.match(inventory, /if \(!sync\.isEditing \|\| !sync\.dirty\) return true/);
  assert.match(inventory, /await sync\.saveNow\(\)/);
});

test("selesai mengedit melepas current lock dan tidak release lock sesi lain", async () => {
  const [hook, sql] = await Promise.all([
    readFile(new URL("../app/hooks/useServerDraft.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260810010000_station_auth_autosave.sql", import.meta.url), "utf8"),
  ]);
  assert.match(hook, /const finishEditing = useCallback/);
  assert.match(hook, /await release\(\)/);
  assert.match(sql, /and submission\.locked_by_session_id = p_session_id/);
  assert.doesNotMatch(sql, /release all locks/i);
});

test("seluruh logout memakai scope lokal dan read-only dapat mencoba acquire ulang", async () => {
  const [inventory, accountProblem, logoutLib, hook] = await Promise.all([
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/AccountProblem.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/local-logout.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/hooks/useServerDraft.ts", import.meta.url), "utf8"),
  ]);
  assert.match(logoutLib, /signOut\(\{ scope: "local" \}\)/);
  assert.match(inventory, /releaseLock: sync\.release/);
  assert.match(accountProblem, /logoutCurrentBrowser/);
  assert.match(inventory, /sync\.status === "read-only"[\s\S]*sync\.reopen/);
  assert.match(hook, /const reopen = useCallback\(\(\) => setRetryTick/);
});

test("format ekspor lama tetap tersedia", async () => {
  const source = await readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8");
  assert.match(source, /Unduh JSON/);
  assert.match(source, /Unduh CSV/);
  assert.match(source, /download-options/);
  assert.match(source, /SITE_METADATA_CSV_HEADERS/);
  assert.match(source, /getItemUnits\(item\)/);
});
