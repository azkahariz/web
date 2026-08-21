import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { resolveLocalDatabaseUrl } from "./master/database-connection.mjs";

const databaseUrl = resolveLocalDatabaseUrl();
const sql = postgres(databaseUrl, { ssl: false, max: 1, connect_timeout: 15, idle_timeout: 5 });
const rollbackMarker = `ROLLBACK_SITE_SUBTYPE_FAMILY_${randomUUID()}`;

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function createAuthUser(tx) {
  const id = randomUUID();
  await tx`
    insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (${id}, 'authenticated', 'authenticated', ${`${id}@verify.invalid`}, '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
  `;
  return id;
}

async function expectRejected(tx, siteId, subtypeId, sessionId, label) {
  await tx.unsafe(`
    do $$
    begin
      perform * from public.open_submission(
        '${siteId}'::uuid, '${subtypeId}'::uuid, '${sessionId}'::uuid, 'Verifier stale client'
      );
      raise exception 'expected_site_subtype_rejection';
    exception
      when sqlstate '22023' then
        if sqlerrm <> 'site_subtype_not_allowed' then raise; end if;
    end;
    $$;
  `);
  const [{ count }] = await tx`
    select count(*)::integer as count from public.submissions
    where site_id = ${siteId} and site_subtype_id = ${subtypeId} and archived_at is null
  `;
  assert(count === 0, `${label}: invalid pair tidak boleh membuat submission.`);
}

try {
  await sql.begin(async (tx) => {
    const stationId = randomUUID();
    const awosTypeId = randomUUID();
    const otherTypeId = randomUUID();
    const allWeatherSiteId = randomUUID();
    const coastalSiteId = randomUUID();
    const otherSiteId = randomUUID();
    const allWeatherSubtypeIds = Array.from({ length: 4 }, () => randomUUID());
    const coastalSubtypeIds = Array.from({ length: 4 }, () => randomUUID());
    const otherSubtypeId = randomUUID();
    const userId = await createAuthUser(tx);
    await tx`insert into public.stations (id, name) values (${stationId}, 'Verifier Cengkareng')`;
    await tx`insert into public.station_accounts (auth_user_id, station_id, username) values (${userId}, ${stationId}, ${`family-${userId}`})`;
    await tx`
      insert into public.site_types (id, name) values
        (${awosTypeId}, 'Verifier AWOS Kategori III'),
        (${otherTypeId}, 'Verifier AWS')
    `;
    await tx`
      insert into public.sites (id, station_id, site_type_id, name) values
        (${allWeatherSiteId}, ${stationId}, ${awosTypeId}, 'Verifier All Weather 25 L & 7 R'),
        (${coastalSiteId}, ${stationId}, ${awosTypeId}, 'Verifier Coastal 25 R & 07 L'),
        (${otherSiteId}, ${stationId}, ${otherTypeId}, 'Verifier AWS Site')
    `;
    const roles = ["End Point", "Mid", "Station", "TDZ"];
    await tx`insert into public.site_subtypes ${tx(allWeatherSubtypeIds.map((id, index) => ({
      id, site_type_id: awosTypeId, name: `Verifier AllWeather ${roles[index]}`,
    })))}`;
    await tx`insert into public.site_subtypes ${tx(coastalSubtypeIds.map((id, index) => ({
      id, site_type_id: awosTypeId, name: `Verifier Coastal ${roles[index]}`,
    })))}`;
    await tx`insert into public.site_subtypes (id, site_type_id, name) values (${otherSubtypeId}, ${otherTypeId}, 'Verifier AWS Station')`;

    const historicalId = randomUUID();
    await tx`
      insert into public.submissions (id, station_id, site_id, site_subtype_id, archived_at, payload, version)
      values (${historicalId}, ${stationId}, ${allWeatherSiteId}, ${coastalSubtypeIds[0]}, now(), '{"inventory":{}}'::jsonb, 7)
    `;
    await tx`update public.site_types set requires_site_subtype_assignment = true where id = ${awosTypeId}`;
    await tx`insert into public.site_subtype_assignments ${tx([
      ...allWeatherSubtypeIds.map((siteSubtypeId) => ({ site_id: allWeatherSiteId, site_subtype_id: siteSubtypeId, site_type_id: awosTypeId })),
      ...coastalSubtypeIds.map((siteSubtypeId) => ({ site_id: coastalSiteId, site_subtype_id: siteSubtypeId, site_type_id: awosTypeId })),
    ])}`;

    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
    const openedIds = [];
    for (const subtypeId of allWeatherSubtypeIds) {
      const [opened] = await tx`select * from public.open_submission(${allWeatherSiteId}, ${subtypeId}, ${randomUUID()}, 'Verifier AllWeather')`;
      assert(opened.can_edit, "AllWeather authoritative subtype harus dapat dibuka.");
      openedIds.push(opened.submission_id);
    }
    for (const subtypeId of coastalSubtypeIds) {
      const [opened] = await tx`select * from public.open_submission(${coastalSiteId}, ${subtypeId}, ${randomUUID()}, 'Verifier Coastal')`;
      assert(opened.can_edit, "Coastal authoritative subtype harus dapat dibuka.");
    }
    const [existing] = await tx`select * from public.open_submission(${allWeatherSiteId}, ${allWeatherSubtypeIds[0]}, ${randomUUID()}, 'Verifier existing')`;
    assert(existing.submission_id === openedIds[0], "Existing valid submission harus dipakai kembali, bukan dibuat ulang.");

    await expectRejected(tx, allWeatherSiteId, coastalSubtypeIds[1], randomUUID(), "AllWeather + Coastal");
    await expectRejected(tx, coastalSiteId, allWeatherSubtypeIds[1], randomUUID(), "Coastal + AllWeather");
    await expectRejected(tx, allWeatherSiteId, otherSubtypeId, randomUUID(), "Different Site Type");

    const [otherOpened] = await tx`select * from public.open_submission(${otherSiteId}, ${otherSubtypeId}, ${randomUUID()}, 'Verifier non-AWOS')`;
    assert(otherOpened.can_edit, "Non-AWOS type-wide pair harus tetap dapat dibuka.");
    await tx`reset role`;
    const [historical] = await tx`select id, site_subtype_id, archived_at, version, payload from public.submissions where id = ${historicalId}`;
    assert(historical.site_subtype_id === coastalSubtypeIds[0] && historical.archived_at && historical.version === 7,
      "Archived historical mismatch harus tetap utuh.");
    await tx.unsafe(`
      do $$
      begin
        insert into public.submissions (station_id, site_id, site_subtype_id)
        values ('${stationId}'::uuid, '${allWeatherSiteId}'::uuid, '${coastalSubtypeIds[2]}'::uuid);
        raise exception 'expected_trigger_rejection';
      exception
        when sqlstate '22023' then
          if sqlerrm <> 'site_subtype_not_allowed' then raise; end if;
      end;
      $$;
    `);
    const [{ invalidCount }] = await tx`
      select count(*)::integer as "invalidCount" from public.submissions
      where archived_at is null and (
        (site_id = ${allWeatherSiteId} and site_subtype_id = any(${coastalSubtypeIds}))
        or (site_id = ${coastalSiteId} and site_subtype_id = any(${allWeatherSubtypeIds}))
      )
    `;
    assert(invalidCount === 0, "Direct insert dan RPC rejection harus menghasilkan zero invalid mutation.");
    throw new Error(rollbackMarker);
  });
  throw new Error("Verifier seharusnya rollback.");
} catch (error) {
  if (error instanceof Error && error.message === rollbackMarker) {
    console.log("Verifikasi Site/Subtype family lulus; seluruh fixture database telah di-rollback.");
  } else {
    throw error;
  }
} finally {
  await sql.end({ timeout: 5 });
}
