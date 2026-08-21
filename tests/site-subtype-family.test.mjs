import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260826120000_open_submission_site_subtype_validation.sql", import.meta.url);

test("server memakai relasi UUID Site/Subtype dan menolak pair yang tidak diizinkan", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /create table public\.site_subtype_assignments/);
  assert.match(migration, /primary key \(site_id, site_subtype_id\)/);
  assert.match(migration, /foreign key \(site_id, site_type_id\)/);
  assert.match(migration, /foreign key \(site_subtype_id, site_type_id\)/);
  assert.match(migration, /public\.site_subtype_is_allowed\(p_site_id, p_site_subtype_id\)/);
  assert.match(migration, /raise exception 'site_subtype_not_allowed'/);
  assert.match(migration, /before insert or update of site_id, site_subtype_id on public\.submissions/);
  assert.doesNotMatch(migration, /site\.name.*(?:Coastal|AllWeather)|subtype\.name.*(?:Coastal|AllWeather)/is);
});

test("Cengkareng AllWeather dan Coastal disimpan sebagai assignment UUID yang berbeda", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  const allWeather = migration.match(/'cd5167ab-e1b2-4939-8040-85dc4259d258'.*array\[([^\]]+)\]/)?.[1] ?? "";
  const coastal = migration.match(/'24e992b7-8683-4f12-92af-2a594ab3b2c0'.*array\[([^\]]+)\]/)?.[1] ?? "";
  assert.match(allWeather, /16b12328-79b9-49ae-8037-951a432b6d1f/);
  assert.doesNotMatch(allWeather, /891c96c6-db4b-45c3-9046-aaa624992fd3/);
  assert.match(coastal, /891c96c6-db4b-45c3-9046-aaa624992fd3/);
  assert.doesNotMatch(coastal, /16b12328-79b9-49ae-8037-951a432b6d1f/);
});

test("Admin ensure dan Station UI memakai error Site/Subtype yang stabil", async () => {
  const [route, hook, inventory] = await Promise.all([
    readFile(new URL("../app/api/admin/submissions/ensure/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/hooks/useServerDraft.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /rpc\("site_subtype_is_allowed"/);
  assert.doesNotMatch(route, /getAllowedSiteSubtypes/);
  assert.match(hook, /error\?\.code === "22023"/);
  assert.match(hook, /site_subtype_not_allowed/);
  assert.match(inventory, /sync\.openError/);
});
