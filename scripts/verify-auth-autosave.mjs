import postgres from "postgres";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) throw new Error("SUPABASE_DB_URL wajib tersedia.");

const sql = postgres(databaseUrl, { ssl: "require", max: 1, connect_timeout: 15, idle_timeout: 5 });
const rollbackMarker = `ROLLBACK_VERIFY_${randomUUID()}`;
let existingAccountCount = 0;

function assert(value, message) {
  if (!value) throw new Error(message);
}

try {
  const accountCount = await sql`select count(*)::integer as count from public.station_accounts`;
  existingAccountCount = accountCount[0].count;
  await sql.begin(async (tx) => {
    let scopes = await tx`
      select distinct on (site.station_id)
        account.auth_user_id, site.station_id, site.id as site_id, subtype.id as subtype_id
      from public.sites as site
      join public.station_accounts as account
        on account.station_id = site.station_id
       and account.active
      join public.site_subtypes as subtype
        on subtype.site_type_id = site.site_type_id
       and subtype.active
      where site.active
      order by site.station_id, site.name, subtype.name
      limit 2
    `;
    let firstUserId;
    let secondUserId;
    if (scopes.length === 2) {
      firstUserId = scopes[0].auth_user_id;
      secondUserId = scopes[1].auth_user_id;
    } else {
      scopes = await tx`
        select distinct on (site.station_id)
          site.station_id, site.id as site_id, subtype.id as subtype_id
        from public.sites as site
        join public.site_subtypes as subtype
          on subtype.site_type_id = site.site_type_id
         and subtype.active
        where site.active
          and not exists (
            select 1 from public.station_accounts as account
            where account.station_id = site.station_id
          )
        order by site.station_id, site.name, subtype.name
        limit 2
      `;
      assert(scopes.length === 2, "Diperlukan sedikitnya dua stasiun aktif untuk verifikasi.");
      firstUserId = randomUUID();
      secondUserId = randomUUID();
      await tx`
        insert into auth.users (
          id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) values
          (${firstUserId}, 'authenticated', 'authenticated', ${`${firstUserId}@verify.invalid`}, '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
          (${secondUserId}, 'authenticated', 'authenticated', ${`${secondUserId}@verify.invalid`}, '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
      `;
      await tx`
        insert into public.station_accounts (auth_user_id, station_id, username)
        values (${firstUserId}, ${scopes[0].station_id}, ${`verify-${firstUserId}`}),
               (${secondUserId}, ${scopes[1].station_id}, ${`verify-${secondUserId}`})
      `;
    }
    const otherDraft = await tx`
      select site.id as site_id, subtype.id as subtype_id
      from public.sites as site
      join public.site_subtypes as subtype
        on subtype.site_type_id = site.site_type_id
       and subtype.active
      where site.station_id = ${scopes[0].station_id}
        and site.active
        and (site.id <> ${scopes[0].site_id} or subtype.id <> ${scopes[0].subtype_id})
      order by site.name, subtype.name
      limit 1
    `;
    assert(otherDraft.length === 1, "Stasiun uji memerlukan dua draf berbeda.");

    const firstSessionId = randomUUID();
    const secondSessionId = randomUUID();

    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${firstUserId}, true)`;
    const visibleAccounts = await tx`select station_id from public.station_accounts`;
    assert(visibleAccounts.length === 1 && visibleAccounts[0].station_id === scopes[0].station_id, "RLS akun tidak terisolasi.");

    await tx.unsafe(`
      do $$
      begin
        perform * from public.open_submission(
          '${scopes[1].site_id}'::uuid,
          '${scopes[1].subtype_id}'::uuid,
          '${firstSessionId}'::uuid,
          'Verifier'
        );
        raise exception 'cross_station_access_was_not_blocked';
      exception
        when insufficient_privilege then null;
      end
      $$;
    `);

    const opened = await tx`
      select * from public.open_submission(
        ${scopes[0].site_id}, ${scopes[0].subtype_id}, ${firstSessionId}, 'Verifier A'
      )
    `;
    assert(opened[0]?.can_edit === true && opened[0]?.version === 0, "Sesi pertama gagal memperoleh lock.");

    const secondOpen = await tx`
      select * from public.open_submission(
        ${scopes[0].site_id}, ${scopes[0].subtype_id}, ${secondSessionId}, 'Verifier B'
      )
    `;
    assert(secondOpen[0]?.can_edit === false && secondOpen[0]?.can_takeover === false, "Sesi kedua seharusnya baca-saja.");

    const earlyTakeover = await tx`
      select * from public.takeover_submission_lock(
        ${scopes[0].site_id}, ${scopes[0].subtype_id}, ${secondSessionId}, 'Verifier B'
      )
    `;
    assert(earlyTakeover[0]?.acquired === false, "Takeover sebelum lima menit seharusnya ditolak.");

    const parallelDraft = await tx`
      select * from public.open_submission(
        ${otherDraft[0].site_id}, ${otherDraft[0].subtype_id}, ${secondSessionId}, 'Verifier B'
      )
    `;
    assert(parallelDraft[0]?.can_edit === true, "Dua sesi seharusnya dapat mengedit draf berbeda.");

    const saved = await tx`
      select * from public.save_submission(
        ${scopes[0].site_id}, ${scopes[0].subtype_id}, ${firstSessionId}, 0,
        ${tx.json({ schemaVersion: 1, inventory: { verifier: true } })}, 'Verifier A'
      )
    `;
    assert(saved[0]?.status === "saved" && saved[0]?.version === 1, "Autosave versi awal gagal.");
    const restored = await tx`
      select * from public.get_submission_state(${scopes[0].site_id}, ${scopes[0].subtype_id})
    `;
    assert(restored[0]?.payload?.inventory?.verifier === true, "Payload server tidak dapat direstore lossless.");

    const released = await tx`
      select public.release_submission_lock(
        ${scopes[0].site_id}, ${scopes[0].subtype_id}, ${firstSessionId}
      ) as released
    `;
    assert(released[0]?.released === true, "Logout sesi A gagal melepas lock draf A.");

    await tx`reset role`;
    const lockStates = await tx`
      select site_id, site_subtype_id, locked_by_session_id
      from public.submissions
      where station_id = ${scopes[0].station_id}
        and ((site_id = ${scopes[0].site_id} and site_subtype_id = ${scopes[0].subtype_id})
          or (site_id = ${otherDraft[0].site_id} and site_subtype_id = ${otherDraft[0].subtype_id}))
      order by site_id
    `;
    const firstLock = lockStates.find((row) =>
      row.site_id === scopes[0].site_id && row.site_subtype_id === scopes[0].subtype_id,
    );
    const secondLock = lockStates.find((row) =>
      row.site_id === otherDraft[0].site_id && row.site_subtype_id === otherDraft[0].subtype_id,
    );
    assert(firstLock?.locked_by_session_id === null, "Release sesi A tidak boleh menyisakan lock draf A.");
    assert(secondLock?.locked_by_session_id === secondSessionId, "Release sesi A tidak boleh melepas lock sesi B.");

    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${firstUserId}, true)`;
    const afterLogoutOpen = await tx`
      select * from public.open_submission(
        ${scopes[0].site_id}, ${scopes[0].subtype_id}, ${secondSessionId}, 'Verifier B'
      )
    `;
    assert(
      afterLogoutOpen[0]?.can_edit === true
        && afterLogoutOpen[0]?.version === 1
        && afterLogoutOpen[0]?.payload?.inventory?.verifier === true,
      "Sesi B seharusnya langsung memperoleh lock serta payload/version terbaru setelah release A.",
    );

    const releasedByB = await tx`
      select public.release_submission_lock(
        ${scopes[0].site_id}, ${scopes[0].subtype_id}, ${secondSessionId}
      ) as released
    `;
    assert(releasedByB[0]?.released === true, "Release sesi B gagal.");

    const thirdSessionId = randomUUID();
    const openedByC = await tx`
      select * from public.open_submission(
        ${scopes[0].site_id}, ${scopes[0].subtype_id}, ${thirdSessionId}, 'Verifier C'
      )
    `;
    assert(openedByC[0]?.can_edit === true, "Sesi C seharusnya dapat memperoleh lock yang baru dilepas B.");

    const staleRetryByA = await tx`
      select * from public.open_submission(
        ${scopes[0].site_id}, ${scopes[0].subtype_id}, ${firstSessionId}, 'Verifier A'
      )
    `;
    assert(
      staleRetryByA[0]?.can_edit === false && staleRetryByA[0]?.lock_operator_name === 'Verifier C',
      "Retry A harus ditolak dan menerima pemilik lock C terbaru.",
    );

    await tx`reset role`;
    await tx`
      update public.submissions
      set lock_last_activity_at = now() - interval '6 minutes'
      where station_id = ${scopes[0].station_id}
        and site_id = ${scopes[0].site_id}
        and site_subtype_id = ${scopes[0].subtype_id}
    `;
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${firstUserId}, true)`;

    const takeover = await tx`
      select * from public.takeover_submission_lock(
        ${scopes[0].site_id}, ${scopes[0].subtype_id}, ${firstSessionId}, 'Verifier A'
      )
    `;
    assert(takeover[0]?.acquired === true && takeover[0]?.version === 1, "Takeover lock kedaluwarsa gagal.");

    const secondSave = await tx`
      select * from public.save_submission(
        ${scopes[0].site_id}, ${scopes[0].subtype_id}, ${firstSessionId}, 1,
        ${tx.json({ schemaVersion: 1, inventory: { verifier: "new" } })}, 'Verifier A'
      )
    `;
    assert(secondSave[0]?.status === "saved" && secondSave[0]?.version === 2, "Penyimpanan setelah takeover gagal.");

    const staleSave = await tx`
      select * from public.save_submission(
        ${scopes[0].site_id}, ${scopes[0].subtype_id}, ${firstSessionId}, 1,
        ${tx.json({ schemaVersion: 1, inventory: { verifier: "stale" } })}, 'Verifier A'
      )
    `;
    assert(staleSave[0]?.status === "version_conflict" && staleSave[0]?.version === 2, "Versi lama tidak ditolak.");

    throw new Error(rollbackMarker);
  });
} catch (error) {
  if (!(error instanceof Error) || error.message !== rollbackMarker) throw error;
} finally {
  await sql.end({ timeout: 5 });
}

console.log(`Verifikasi Supabase lulus; seluruh data uji telah di-rollback. Akun existing: ${existingAccountCount}.`);
