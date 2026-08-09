import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { parse } from "csv-parse/sync";
import { assignTestIds, loadMasterSource, sourceCounts, writeSyncedCsv } from "../scripts/master/source.mjs";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceRoot = path.dirname(projectRoot);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test("master source dinormalisasi sesuai kontrak CSV existing", async () => {
  const model = await loadMasterSource(sourceRoot);
  const generated = JSON.parse(await readFile(path.join(projectRoot, "app", "data.generated.json"), "utf8"));
  const counts = sourceCounts(model);
  assert.ok(Object.values(counts).every((count) => count > 0));
  assert.equal(counts.sites, model.sourceRows.stationRows.length);
  assert.ok(counts.profileItems <= model.sourceRows.profileItemRows.length);
  assert.ok(counts.productCategories <= model.sourceRows.productCategoryRows.length);
  assert.ok(counts.products <= model.sourceRows.productRows.length);
  assert.ok(model.registries.siteSubtypes.rows.some((row) => row.name.endsWith("TDZ") && row.profile?.name === "AWOS TDZ"));
  assert.equal(generated.master, undefined);
});

test("round-trip CSV menambahkan UUID konsisten tanpa menghilangkan baris", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "aloptama-master-"));
  try {
    const model = await loadMasterSource(sourceRoot);
    assignTestIds(model);
    const outputFiles = await writeSyncedCsv(model, path.join(temporaryRoot, "output"));
    assert.equal(outputFiles.length, 5);

    const stationText = await readFile(outputFiles.find((file) => file.endsWith("Nama Stasiun.synced.csv")), "utf8");
    const stationRows = parse(stationText, { bom: true, columns: true, skip_empty_lines: true });
    assert.equal(stationRows.length, model.sourceRows.stationRows.length);
    assert.ok(stationRows.every((row) => UUID_PATTERN.test(row.station_id) && UUID_PATTERN.test(row.site_id) && UUID_PATTERN.test(row.site_type_id)));

    const importedRoot = path.join(temporaryRoot, "imported");
    await mkdir(importedRoot);
    for (const file of outputFiles) {
      await cp(file, path.join(importedRoot, path.basename(file).replace(".synced.csv", ".csv")));
    }
    const imported = await loadMasterSource(importedRoot);
    assert.deepEqual(sourceCounts(imported), sourceCounts(model));
    for (const registry of Object.values(imported.registries)) {
      assert.ok(registry.rows.every((row) => UUID_PATTERN.test(row.sourceId)));
    }

    const generatedPath = path.join(temporaryRoot, "data.generated.json");
    const generator = spawnSync("powershell.exe", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(projectRoot, "scripts", "generate-data.ps1"),
      "-InputRoot", importedRoot, "-GeneratedOutput", generatedPath,
    ], { encoding: "utf8" });
    assert.equal(generator.status, 0, generator.stderr || generator.stdout);
    const generated = JSON.parse(await readFile(generatedPath, "utf8"));
    assert.equal(generated.master.profileItems.length, model.sourceRows.profileItemRows.length);
    assert.equal(generated.master.productCategories.length, sourceCounts(model).productCategories);
    assert.ok(generated.stationSites.every((row) => UUID_PATTERN.test(row.stationId) && UUID_PATTERN.test(row.siteId)));
    assert.ok(generated.products.every((row) => UUID_PATTERN.test(row.productId)));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("migration memakai UUID, foreign key, RLS, dan tidak menyediakan hard delete", async () => {
  const [migration, databaseSource] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260809190000_master_data.sql", import.meta.url), "utf8"),
    readFile(new URL("../scripts/master/database.mjs", import.meta.url), "utf8"),
  ]);
  for (const table of ["stations", "site_types", "sites", "item_profiles", "site_subtypes", "items", "profile_items", "product_categories", "products"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
  }
  assert.match(migration, /id uuid primary key default gen_random_uuid\(\)/);
  assert.match(migration, /references public\.stations\(id\) on delete restrict/);
  assert.match(migration, /enable row level security/);
  assert.doesNotMatch(databaseSource, /delete\s+from/i);
});
