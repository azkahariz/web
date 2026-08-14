import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { synchronizeMaster } from "./master/database.mjs";
import { resolveLocalDatabaseUrl, resolveRemoteDatabaseUrl } from "./master/database-connection.mjs";
import { loadMasterSource, sourceCounts, writeSyncedCsv } from "./master/source.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(scriptDirectory);
const sourceRoot = path.dirname(projectRoot);
const outputRoot = path.join(projectRoot, "sync-output");
const validateOnly = process.argv.includes("--validate-only");
const localTarget = process.argv.includes("--target=local");
const allowLegacyRemoteImport = process.argv.includes("--allow-legacy-remote-import");

const envPath = path.join(projectRoot, ".env.local");
if (existsSync(envPath)) loadEnvFile(envPath);

function generateApplicationData() {
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(scriptDirectory, "generate-data.ps1")],
    { cwd: projectRoot, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "generate-data.ps1 gagal.").trim());
  }
}

function printSourceSummary(counts) {
  console.log("MASTER SOURCE VALIDATION");
  console.log("================================");
  for (const [name, count] of Object.entries(counts)) console.log(`${name}: ${count}`);
}

function printSyncSummary(result) {
  console.log("\nMASTER SYNC");
  console.log("================================");
  for (const [name, stats] of Object.entries(result.stats)) {
    console.log(`\n${name}`);
    console.log(`+ ${stats.inserted} inserted`);
    console.log(`~ ${stats.updated} updated`);
    console.log(`o ${stats.deactivated} deactivated`);
    console.log(`^ ${stats.reactivated} reactivated`);
    console.log(`= ${stats.unchanged} unchanged`);
  }
  console.log(`\nWarnings: ${result.warnings.length}`);
  for (const warning of result.warnings.slice(0, 20)) console.log(`! ${warning}`);
  if (result.warnings.length > 20) console.log(`! ${result.warnings.length - 20} warning lain tidak ditampilkan.`);
  console.log("\nNo hard deletes performed.");
}

try {
  const model = await loadMasterSource(sourceRoot);
  printSourceSummary(sourceCounts(model));

  if (validateOnly) {
    console.log("\nValidation complete. Database was not changed.");
    process.exitCode = 0;
  } else {
    if (!localTarget && !allowLegacyRemoteImport) {
      throw new Error("Legacy import ke database remote diblokir. Gunakan npm.cmd run sync:master:local untuk development, atau npm.cmd run sync:master:legacy:remote hanya untuk recovery yang sudah disetujui.");
    }
    generateApplicationData();
    const databaseUrl = localTarget ? resolveLocalDatabaseUrl() : resolveRemoteDatabaseUrl();
    const result = await synchronizeMaster(model, databaseUrl);
    const files = await writeSyncedCsv(model, outputRoot);
    printSyncSummary(result);
    console.log("\nSynced CSV:");
    for (const file of files) console.log(`- ${path.relative(projectRoot, file)}`);
  }
} catch (error) {
  console.error(`\nMASTER SYNC FAILED\n${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
