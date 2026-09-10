import postgres from "postgres";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) throw new Error("SUPABASE_DB_URL wajib tersedia.");

const sql = postgres(databaseUrl, {
  ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? false : "require",
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
});
const rollbackMarker = `ROLLBACK_VERIFY_${randomUUID()}`;

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function expectClosed(tx, action, label) {
  await tx.savepoint(async (savepoint) => {
    try {
      await action(savepoint);
      throw new Error(`${label} tidak ditolak saat akses ditutup.`);
    } catch (error) {
      assert(error?.code === "42501" && error?.message?.includes("upt_data_entry_closed"), `${label} tidak memakai error contract akses tertutup.`);
      throw error;
    }
  }).catch((error) => {
    assert(error?.code === "42501" && error?.message?.includes("upt_data_entry_closed"), `${label} gagal diisolasi oleh savepoint.`);
  });
}

async function expectForbidden(tx, action, label) {
  await tx.savepoint(async (savepoint) => {
    try {
      await action(savepoint);
      throw new Error(`${label} tidak ditolak.`);
    } catch (error) {
      assert(error?.code === "42501", `${label} tidak memakai insufficient_privilege.`);
      throw error;
    }
  }).catch((error) => assert(error?.code === "42501", `${label} gagal diisolasi oleh savepoint.`));
}

try {
  await sql.begin(async (tx) => {
    let scopeRows = await tx`
      select account.auth_user_id, site.station_id, site.id as site_id, subtype.id as subtype_id
      from public.station_accounts as account
      join public.sites as site on site.station_id = account.station_id and site.active
      join public.site_subtypes as subtype on subtype.site_type_id = site.site_type_id and subtype.active
      where account.active and public.site_subtype_is_allowed(site.id, subtype.id)
      order by site.name, subtype.name
      limit 1
    `;
    if (!scopeRows.length) {
      const stationId = randomUUID();
      const siteTypeId = randomUUID();
      const siteId = randomUUID();
      const subtypeId = randomUUID();
      const stationUserId = randomUUID();
      await tx`insert into public.stations (id, name) values (${stationId}, ${`Verifier Station ${stationId}`})`;
      await tx`insert into public.site_types (id, name) values (${siteTypeId}, ${`Verifier Site Type ${siteTypeId}`})`;
      await tx`insert into public.sites (id, station_id, site_type_id, name) values (${siteId}, ${stationId}, ${siteTypeId}, ${`Verifier Site ${siteId}`})`;
      await tx`insert into public.site_subtypes (id, site_type_id, name) values (${subtypeId}, ${siteTypeId}, ${`Verifier Subtype ${subtypeId}`})`;
      await tx`
        insert into auth.users (
          id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) values (
          ${stationUserId}, 'authenticated', 'authenticated', ${`${stationUserId}@verify.invalid`}, '', now(),
          '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
        )
      `;
      await tx`insert into public.station_accounts (auth_user_id, station_id, username) values (${stationUserId}, ${stationId}, ${`verify-${stationUserId}`})`;
      scopeRows = [{ station_id: stationId, site_id: siteId, subtype_id: subtypeId, auth_user_id: stationUserId }];
    }

    let adminRows = await tx`select auth_user_id from public.super_admins where active order by created_at limit 1`;
    if (!adminRows.length) {
      const adminUserId = randomUUID();
      await tx`
        insert into auth.users (
          id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) values (
          ${adminUserId}, 'authenticated', 'authenticated', ${`${adminUserId}@verify.invalid`}, '', now(),
          '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
        )
      `;
      await tx`insert into public.super_admins (auth_user_id, username) values (${adminUserId}, ${`verify-admin-${adminUserId}`})`;
      adminRows = [{ auth_user_id: adminUserId }];
    }
    assert(scopeRows.length === 1, "Scope Station aktif untuk verifier tidak ditemukan.");
    assert(adminRows.length === 1, "Super Admin aktif untuk verifier tidak ditemukan.");
    const scope = scopeRows[0];
    const adminUserId = adminRows[0].auth_user_id;
    const stationSessionId = randomUUID();
    const adminSessionId = randomUUID();

    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${adminUserId}, true)`;
    const openedSetting = await tx`select * from public.set_upt_data_entry_enabled(true)`;
    assert(openedSetting[0]?.enabled === true, "Verifier gagal memastikan status awal ON.");

    await tx`select set_config('request.jwt.claim.sub', ${scope.auth_user_id}, true)`;
    const summariesBefore = await tx`select * from public.list_station_submission_summaries()`;
    const opened = await tx`select * from public.open_submission(${scope.site_id}, ${scope.subtype_id}, ${stationSessionId}, 'Verifier Station')`;
    assert(opened[0]?.can_edit === true, "Station gagal membuka submission saat status ON.");
    const submissionId = opened[0].submission_id;
    const versionBefore = opened[0].version;

    await tx`select set_config('request.jwt.claim.sub', ${adminUserId}, true)`;
    const completionBefore = await tx`select public.admin_completion_monitoring_summary() as payload`;
    const auditBefore = await tx`select count(*)::integer as count from public.admin_audit_log where action = 'UPT_DATA_ENTRY_CLOSED'`;
    const closedSetting = await tx`select * from public.set_upt_data_entry_enabled(false)`;
    assert(closedSetting[0]?.enabled === false, "Super Admin gagal menutup akses.");
    await tx`select * from public.set_upt_data_entry_enabled(false)`;
    const auditAfter = await tx`select count(*)::integer as count from public.admin_audit_log where action = 'UPT_DATA_ENTRY_CLOSED'`;
    assert(auditAfter[0].count === auditBefore[0].count + 1, "Toggle idempotent membuat audit duplikat.");
    const completionAfter = await tx`select public.admin_completion_monitoring_summary() as payload`;
    assert(JSON.stringify(completionAfter) === JSON.stringify(completionBefore), "Toggle mengubah output Completion/Site Type/Gudang.");

    await tx`select set_config('request.jwt.claim.sub', ${scope.auth_user_id}, true)`;
    const status = await tx`select * from public.get_upt_data_entry_status()`;
    assert(status[0]?.enabled === false, "Station tidak membaca status OFF authoritative.");
    const summariesAfter = await tx`select * from public.list_station_submission_summaries()`;
    assert(JSON.stringify(summariesAfter) === JSON.stringify(summariesBefore), "Status OFF mengubah hasil progress read-only.");

    await expectClosed(tx, (sp) => sp`select * from public.get_submission_state(${scope.site_id}, ${scope.subtype_id})`, "Read form");
    await expectClosed(tx, (sp) => sp`select * from public.open_submission(${scope.site_id}, ${scope.subtype_id}, ${randomUUID()}, 'Blocked')`, "Open submission");
    await expectClosed(tx, (sp) => sp`select public.touch_submission_lock(${scope.site_id}, ${scope.subtype_id}, ${stationSessionId}, 'Blocked')`, "Renew lock");
    await expectClosed(tx, (sp) => sp`select * from public.takeover_submission_lock(${scope.site_id}, ${scope.subtype_id}, ${randomUUID()}, 'Blocked')`, "Takeover lock");
    await expectClosed(tx, (sp) => sp`select * from public.save_submission(${scope.site_id}, ${scope.subtype_id}, ${stationSessionId}, ${versionBefore}, ${sp.json({ schemaVersion: 1, inventory: { blocked: true } })}, 'Blocked')`, "Save submission");
    await expectClosed(tx, (sp) => sp`select * from public.create_product_proposal(${scope.site_id}, ${scope.subtype_id}, 'Blocked Brand', 'Blocked Model', 'Blocked', null)`, "Product proposal");

    const released = await tx`select public.release_submission_lock(${scope.site_id}, ${scope.subtype_id}, ${stationSessionId}) as released`;
    assert(released[0]?.released === true, "Station harus tetap dapat melepas lock saat status OFF.");

    await tx`reset role`;
    const unchanged = await tx`select version, payload, locked_by_session_id from public.submissions where id = ${submissionId}`;
    assert(unchanged[0]?.version === versionBefore, "Blocked save mengubah version submission.");
    assert(unchanged[0]?.payload?.inventory?.blocked !== true, "Blocked save mengubah payload submission.");
    assert(unchanged[0]?.locked_by_session_id === null, "Release saat OFF tidak membersihkan lock.");

    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${adminUserId}, true)`;
    const adminOpened = await tx`select * from public.admin_open_submission(${submissionId}, ${adminSessionId}, 'Verifier Admin')`;
    assert(adminOpened[0]?.can_edit === true, "Super Admin ikut terblokir saat status Station OFF.");
    await tx`select public.admin_release_submission_lock(${submissionId}, ${adminSessionId})`;

    await tx`select set_config('request.jwt.claim.sub', ${scope.auth_user_id}, true)`;
    await expectForbidden(tx, (sp) => sp`select * from public.set_upt_data_entry_enabled(true)`, "Unauthorized toggle");

    await tx`select set_config('request.jwt.claim.sub', ${adminUserId}, true)`;
    const reopened = await tx`select * from public.set_upt_data_entry_enabled(true)`;
    assert(reopened[0]?.enabled === true, "Super Admin gagal membuka kembali akses.");

    await tx`select set_config('request.jwt.claim.sub', ${scope.auth_user_id}, true)`;
    const reopenedSubmission = await tx`select * from public.open_submission(${scope.site_id}, ${scope.subtype_id}, ${stationSessionId}, 'Verifier Station')`;
    assert(reopenedSubmission[0]?.can_edit === true, "Station tidak pulih setelah status dibuka kembali.");

    throw new Error(rollbackMarker);
  });
} catch (error) {
  if (!(error instanceof Error) || error.message !== rollbackMarker) throw error;
} finally {
  await sql.end({ timeout: 5 });
}

console.log("Verifikasi akses pengisian UPT lulus; seluruh perubahan verifier telah di-rollback.");
