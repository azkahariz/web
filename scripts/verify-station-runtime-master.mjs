import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { getAllowedSiteSubtypes } from "../app/lib/site-subtypes.ts";

const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) throw new Error("SUPABASE_DB_URL wajib tersedia untuk verifier lokal.");

const sql = postgres(databaseUrl, {
  ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? false : "require",
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
});
const rollbackMarker = `ROLLBACK_STATION_RUNTIME_MASTER_${randomUUID()}`;

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function createAuthUser(tx, prefix) {
  const id = randomUUID();
  await tx`
    insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (${id}, 'authenticated', 'authenticated', ${`${prefix}-${id}@verify.invalid`}, '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
  `;
  return id;
}

async function runtimeMaster(tx, userId) {
  await tx`set local role authenticated`;
  await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
  const [{ data }] = await tx`select public.station_runtime_master() as data`;
  return data;
}

function allowedIds(master, site) {
  const allowed = getAllowedSiteSubtypes({
    siteName: site.name,
    siteTypeName: site.siteTypeName,
    siteSubtypes: master.siteSubtypes.filter((subtype) => subtype.siteTypeId === site.siteTypeId),
    getSubtypeName: (subtype) => subtype.name,
  });
  return new Set(allowed.map((subtype) => subtype.id));
}

try {
  await sql.begin(async (tx) => {
    const stationA = randomUUID();
    const stationB = randomUUID();
    const typeId = randomUUID();
    const profileId = randomUUID();
    const itemId = randomUUID();
    const cengkarengSiteId = randomUUID();
    const otherSiteId = randomUUID();
    const inactiveSiteId = randomUUID();
    const userA = await createAuthUser(tx, "station-runtime-a");
    const userB = await createAuthUser(tx, "station-runtime-b");
    await tx`
      insert into public.stations (id, name) values
        (${stationA}, 'Verifier Raja Haji Abdullah'),
        (${stationB}, 'Verifier Pattimura')
    `;
    await tx`insert into public.station_accounts (auth_user_id, station_id, username) values
      (${userA}, ${stationA}, ${`runtime-a-${userA}`}),
      (${userB}, ${stationB}, ${`runtime-b-${userB}`})`;
    await tx`insert into public.site_types (id, name) values (${typeId}, 'AWOS Kategori III')`;
    await tx`insert into public.item_profiles (id, name) values (${profileId}, 'Verifier AWOS Profile')`;
    await tx`insert into public.items (id, name) values (${itemId}, 'Verifier Sensor')`;
    await tx`insert into public.profile_items (item_profile_id, item_id) values (${profileId}, ${itemId})`;
    await tx`
      insert into public.sites (id, station_id, site_type_id, name, active) values
        (${cengkarengSiteId}, ${stationA}, ${typeId}, 'AWOS All Weather Kat. 3 Cengkareng 25 L & 7 R', true),
        (${inactiveSiteId}, ${stationA}, ${typeId}, 'AWOS All Weather Kat. 3 Inactive', false),
        (${otherSiteId}, ${stationB}, ${typeId}, 'AWOS All Weather Kat. 3 Pattimura', true)
    `;
    const coastalIds = [];
    const allWeatherIds = [];
    for (const suffix of ["End Point", "Mid", "Station", "TDZ"]) {
      const coastalId = randomUUID();
      const allWeatherId = randomUUID();
      coastalIds.push(coastalId);
      allWeatherIds.push(allWeatherId);
      await tx`insert into public.site_subtypes (id, site_type_id, item_profile_id, name) values
        (${coastalId}, ${typeId}, ${profileId}, ${`AWOS Kategori III Coastal ${suffix}`}),
        (${allWeatherId}, ${typeId}, ${profileId}, ${`AWOS Kategori III AllWeather ${suffix}`})`;
      await tx`
        insert into public.submissions (station_id, site_id, site_subtype_id, payload, version, operator_name)
        values (${stationA}, ${cengkarengSiteId}, ${coastalId}, ${tx.json({ schemaVersion: 1, siteSubtypeId: coastalId, inventory: { "Verifier Sensor": [] } })}, 1, 'Verifier')
      `;
    }

    const before = await runtimeMaster(tx, userA);
    assert(before.station.id === stationA, "Station A tidak menerima identity runtime sendiri.");
    assert(before.sites.length === 1 && before.sites[0].id === cengkarengSiteId, "Runtime Station A membocorkan site lain atau site inactive.");
    assert(before.itemProfiles.length === 1 && before.profileItems.length === 1, "Profil atau mapping kategori aktif tidak lengkap.");
    const beforeAllowed = allowedIds(before, before.sites[0]);
    assert(allWeatherIds.every((id) => beforeAllowed.has(id)), "AllWeather harus menjadi subtype allowed dari nama Site live.");
    assert(coastalIds.every((id) => !beforeAllowed.has(id)), "Coastal legacy tidak boleh menjadi subtype allowed dari nama Site live.");
    assert(before.legacySubmissionSubtypeIdsBySite[cengkarengSiteId].length === 4, "Gate harus menerima empat referensi legacy Coastal.");
    assert(coastalIds.some((id) => !beforeAllowed.has(id)), "Gate remediation sebelum Task A seharusnya aktif.");

    const other = await runtimeMaster(tx, userB);
    assert(other.station.id === stationB && other.sites.length === 1 && other.sites[0].id === otherSiteId, "Station B tidak terisolasi dari master Station A.");

    await tx`reset role`;
    await tx`set local role anon`;
    await tx`select set_config('request.jwt.claim.sub', '', true)`;
    await tx.unsafe(`do $$ begin perform public.station_runtime_master(); raise exception 'unauthenticated_runtime_master_was_not_blocked'; exception when insufficient_privilege then null; end $$;`);
    await tx`reset role`;

    // Efek yang sama dengan Task A pada fixture lokal: pindahkan empat referensi
    // Coastal ke UUID AllWeather yang sepadan dan pertahankan payload inventaris.
    for (let index = 0; index < coastalIds.length; index += 1) {
      await tx`
        update public.submissions
        set site_subtype_id = ${allWeatherIds[index]},
            payload = jsonb_set(payload, '{siteSubtypeId}', to_jsonb(${allWeatherIds[index]}::text), true),
            version = version + 1
        where station_id = ${stationA}
          and site_id = ${cengkarengSiteId}
          and site_subtype_id = ${coastalIds[index]}
      `;
    }
    const after = await runtimeMaster(tx, userA);
    const afterAllowed = allowedIds(after, after.sites[0]);
    assert(after.legacySubmissionSubtypeIdsBySite[cengkarengSiteId].every((id) => afterAllowed.has(id)), "Gate harus hilang setelah referensi submission berpindah ke AllWeather.");
    const payloads = await tx`select payload, version from public.submissions where station_id = ${stationA} and site_id = ${cengkarengSiteId}`;
    assert(payloads.length === 4 && payloads.every((row) => row.payload.inventory?.["Verifier Sensor"] && row.version === 2), "Task A local compatibility transition harus mempertahankan inventory dan menaikkan versi.");
    throw new Error(rollbackMarker);
  });
} catch (error) {
  if (!(error instanceof Error) || error.message !== rollbackMarker) throw error;
} finally {
  await sql.end({ timeout: 5 });
}

console.log("Verifikasi runtime master Station User lulus; fixture, gate, dan transition lokal telah di-rollback.");
