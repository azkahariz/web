import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  chooseInitialDraft,
  readScopedLocalDraft,
  scopedDraftKey,
  writeScopedLocalDraft,
} from "../app/lib/server-draft.ts";

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
  assert.match(hook, /window\.setTimeout\(async \(\) => \{/);
  assert.match(hook, /\}, 1500\)/);
  assert.match(hook, /Date\.now\(\) - lastTouchRef\.current < 45_000/);
  assert.doesNotMatch(hook, /setInterval/);
  assert.match(storage, /sessionStorage\.getItem\(TAB_SESSION_STORAGE_KEY\)/);
  assert.match(storage, /crypto\.randomUUID\(\)/);
});

test("format ekspor lama tetap tersedia", async () => {
  const source = await readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8");
  assert.match(source, /Unduh hasil JSON/);
  assert.match(source, /Unduh hasil CSV/);
  assert.match(source, /SITE_METADATA_CSV_HEADERS/);
  assert.match(source, /getItemUnits\(item\)/);
});

