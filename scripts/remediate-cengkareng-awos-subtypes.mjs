import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import path from "node:path";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { resolveLocalDatabaseUrl, resolveRemoteDatabaseUrl } from "./master/database-connection.mjs";
import {
  applyRemediation,
  inspectRemediation,
  rollbackRemediation,
} from "./cengkareng-awos-remediation-lib.mjs";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(projectRoot, ".env.local");
if (existsSync(envPath)) loadEnvFile(envPath);

const args = new Set(process.argv.slice(2));
const target = [...args].find((arg) => arg.startsWith("--target="))?.slice("--target=".length);
const apply = args.has("--apply");
const rollback = args.has("--rollback");
const backupArg = [...args].find((arg) => arg.startsWith("--backup="))?.slice("--backup=".length);
const remoteConfirmed = args.has("--confirm-remote-apply=CENGKARENG_AWOS_SUBTYPES");
const remoteRollbackConfirmed = args.has("--confirm-remote-rollback=CENGKARENG_AWOS_SUBTYPES");

if (target !== "local" && target !== "remote") throw new Error("Pilih target eksplisit: --target=local atau --target=remote.");
if (apply && rollback && !backupArg) throw new Error("Rollback membutuhkan --backup=<private-output file>.");
if (target === "remote" && apply && !rollback && !remoteConfirmed) throw new Error("Apply remote membutuhkan --confirm-remote-apply=CENGKARENG_AWOS_SUBTYPES.");
if (target === "remote" && apply && rollback && !remoteRollbackConfirmed) throw new Error("Rollback remote membutuhkan --confirm-remote-rollback=CENGKARENG_AWOS_SUBTYPES.");

const databaseUrl = target === "local" ? resolveLocalDatabaseUrl() : resolveRemoteDatabaseUrl();
const sql = postgres(databaseUrl, {
  ssl: target === "local" ? false : "require",
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
});
const defaultBackupPath = path.join(projectRoot, "private-output", "cengkareng-awos-remediation-before.json");
const backupPath = backupArg ? path.resolve(projectRoot, backupArg) : defaultBackupPath;

function printable(inspection) {
  return inspection.plan.map((entry) => ({
    role: entry.role,
    submission: entry.submission?.id ?? null,
    currentSubtype: entry.sourceSubtype.name,
    targetSubtype: entry.targetSubtype.name,
    currentVersion: entry.submission?.version ?? null,
    targetVersion: entry.submission ? entry.submission.version + 1 : null,
    lock: entry.submission?.lock.state ?? "NO_SOURCE_SUBMISSION",
    collision: entry.targetCollision?.id ?? null,
    profileCompatibility: entry.profileCompatibility,
    payloadCompatibility: entry.submission?.payload.compatible ?? null,
    action: entry.action,
  }));
}

try {
  console.log(`Mode: ${apply ? (rollback ? "ROLLBACK" : "APPLY") : "DRY RUN"}`);
  console.log(`Target: ${target}`);
  if (rollback) {
    const backup = JSON.parse(await readFile(backupPath, "utf8"));
    if (!apply) {
      console.log(`Rollback dry-run memakai backup: ${path.relative(projectRoot, backupPath)}`);
    } else {
      const updated = await rollbackRemediation(sql, backup);
      console.log(`Rollback selesai untuk ${updated.length} submission.`);
    }
  } else {
    const inspection = await inspectRemediation(sql);
    console.table(printable(inspection));
    if (apply) {
      if (!inspection.ready) throw new Error("REMEDIATION_NOT_READY; backup dan mutation tidak dilakukan.");
      const result = await applyRemediation(sql, undefined, {
        onReady: async (backup) => {
          await mkdir(path.dirname(backupPath), { recursive: true });
          await writeFile(backupPath, `${JSON.stringify(backup, null, 2)}\n`, "utf8");
        },
      });
      console.log(`Remediation selesai. ${result.updated.length} submission dipindahkan.`);
      console.log(`Backup before-state: ${path.relative(projectRoot, backupPath)}`);
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}
