import postgres from "postgres";
import { naturalText } from "./source.mjs";

function blankStats() {
  return { inserted: 0, updated: 0, deactivated: 0, reactivated: 0, unchanged: 0 };
}

function sameValue(left, right) {
  return (left ?? null) === (right ?? null);
}

async function synchronizeRegistry(tx, registry, config, warnings) {
  const stats = blankStats();

  async function currentState() {
    const rows = await config.select(tx);
    return {
      rows,
      byId: new Map(rows.map((row) => [row.id, row])),
      byNaturalKey: new Map(rows.map((row) => [config.databaseKey(row), row])),
    };
  }

  async function apply(entity, state, requireSourceId) {
    const key = config.sourceKey(entity);
    let databaseRow;
    if (requireSourceId) {
      databaseRow = state.byId.get(entity.sourceId);
      if (!databaseRow) {
        throw new Error(`${registry.label}: UUID ${entity.sourceId} tidak ditemukan di Supabase (${entity.label}).`);
      }
      const collision = state.byNaturalKey.get(key);
      if (collision && collision.id !== databaseRow.id) {
        throw new Error(`${registry.label}: natural key ${entity.label} sudah dipakai UUID lain.`);
      }
    } else {
      databaseRow = state.byNaturalKey.get(key);
    }

    const desired = config.values(entity);
    if (!databaseRow) {
      const inserted = await config.insert(tx, desired);
      entity.resolvedId = inserted.id;
      stats.inserted += 1;
      return;
    }

    entity.resolvedId = databaseRow.id;
    const fieldsChanged = Object.entries(desired).some(([field, value]) => field !== "active" && !sameValue(databaseRow[field], value));
    const activeChanged = databaseRow.active !== desired.active;
    if (!fieldsChanged && !activeChanged) {
      stats.unchanged += 1;
      return;
    }

    await config.update(tx, databaseRow.id, desired);
    if (activeChanged) {
      stats[desired.active ? "reactivated" : "deactivated"] += 1;
    } else {
      stats.updated += 1;
    }
  }

  let state = await currentState();
  for (const entity of registry.rows.filter((row) => row.sourceId)) {
    await apply(entity, state, true);
  }

  state = await currentState();
  for (const entity of registry.rows.filter((row) => !row.sourceId)) {
    await apply(entity, state, false);
  }

  const finalRows = await config.select(tx);
  const sourceIds = new Set(registry.rows.map((row) => row.resolvedId));
  for (const row of finalRows) {
    if (!sourceIds.has(row.id)) {
      warnings.push(`${registry.label}: record ${config.describe(row)} (${row.id}) ada di Supabase tetapi hilang dari CSV sumber.`);
    }
  }

  return stats;
}

function tableConfigurations(registries) {
  return [
    {
      name: "Stations", registry: registries.stations,
      select: (tx) => tx`select id, name, active from public.stations`,
      databaseKey: (row) => naturalText(row.name), sourceKey: (row) => row.key,
      values: (row) => ({ name: row.name, active: row.active }),
      insert: (tx, row) => tx`insert into public.stations ${tx(row)} returning id`.then(([value]) => value),
      update: (tx, id, row) => tx`update public.stations set ${tx(row)} where id = ${id}`,
      describe: (row) => row.name,
    },
    {
      name: "Site types", registry: registries.siteTypes,
      select: (tx) => tx`select id, name, active from public.site_types`,
      databaseKey: (row) => naturalText(row.name), sourceKey: (row) => row.key,
      values: (row) => ({ name: row.name, active: row.active }),
      insert: (tx, row) => tx`insert into public.site_types ${tx(row)} returning id`.then(([value]) => value),
      update: (tx, id, row) => tx`update public.site_types set ${tx(row)} where id = ${id}`,
      describe: (row) => row.name,
    },
    {
      name: "Item profiles", registry: registries.itemProfiles,
      select: (tx) => tx`select id, name, active from public.item_profiles`,
      databaseKey: (row) => naturalText(row.name), sourceKey: (row) => row.key,
      values: (row) => ({ name: row.name, active: row.active }),
      insert: (tx, row) => tx`insert into public.item_profiles ${tx(row)} returning id`.then(([value]) => value),
      update: (tx, id, row) => tx`update public.item_profiles set ${tx(row)} where id = ${id}`,
      describe: (row) => row.name,
    },
    {
      name: "Items", registry: registries.items,
      select: (tx) => tx`select id, name, active from public.items`,
      databaseKey: (row) => naturalText(row.name), sourceKey: (row) => row.key,
      values: (row) => ({ name: row.name, active: row.active }),
      insert: (tx, row) => tx`insert into public.items ${tx(row)} returning id`.then(([value]) => value),
      update: (tx, id, row) => tx`update public.items set ${tx(row)} where id = ${id}`,
      describe: (row) => row.name,
    },
    {
      name: "Product categories", registry: registries.productCategories,
      select: (tx) => tx`select id, name, active from public.product_categories`,
      databaseKey: (row) => naturalText(row.name), sourceKey: (row) => row.key,
      values: (row) => ({ name: row.name, active: row.active }),
      insert: (tx, row) => tx`insert into public.product_categories ${tx(row)} returning id`.then(([value]) => value),
      update: (tx, id, row) => tx`update public.product_categories set ${tx(row)} where id = ${id}`,
      describe: (row) => row.name,
    },
    {
      name: "Products", registry: registries.products,
      select: (tx) => tx`select id, brand, model, active from public.products`,
      databaseKey: (row) => `${naturalText(row.brand)}\u001f${naturalText(row.model)}`,
      sourceKey: (row) => row.key,
      values: (row) => ({ brand: row.brand, model: row.model, active: row.active }),
      insert: (tx, row) => tx`insert into public.products ${tx(row)} returning id`.then(([value]) => value),
      update: (tx, id, row) => tx`update public.products set ${tx(row)} where id = ${id}`,
      describe: (row) => `${row.brand} / ${row.model}`,
    },
    {
      name: "Sites", registry: registries.sites,
      select: (tx) => tx`select id, station_id, site_type_id, name, active from public.sites`,
      databaseKey: (row) => `${row.station_id}\u001f${naturalText(row.name)}`,
      sourceKey: (row) => `${row.station.resolvedId}\u001f${naturalText(row.name)}`,
      values: (row) => ({ station_id: row.station.resolvedId, site_type_id: row.siteType.resolvedId, name: row.name, active: row.active }),
      insert: (tx, row) => tx`insert into public.sites ${tx(row)} returning id`.then(([value]) => value),
      update: (tx, id, row) => tx`update public.sites set ${tx(row)} where id = ${id}`,
      describe: (row) => row.name,
    },
    {
      name: "Site subtypes", registry: registries.siteSubtypes,
      select: (tx) => tx`select id, site_type_id, item_profile_id, name, active from public.site_subtypes`,
      databaseKey: (row) => `${row.site_type_id}\u001f${naturalText(row.name)}`,
      sourceKey: (row) => `${row.siteType.resolvedId}\u001f${naturalText(row.name)}`,
      values: (row) => ({ site_type_id: row.siteType.resolvedId, item_profile_id: row.profile?.resolvedId ?? null, name: row.name, active: row.active }),
      insert: (tx, row) => tx`insert into public.site_subtypes ${tx(row)} returning id`.then(([value]) => value),
      update: (tx, id, row) => tx`update public.site_subtypes set ${tx(row)} where id = ${id}`,
      describe: (row) => row.name,
    },
    {
      name: "Profile-item mappings", registry: registries.profileItems,
      select: (tx) => tx`select id, item_profile_id, item_id, active from public.profile_items`,
      databaseKey: (row) => `${row.item_profile_id}\u001f${row.item_id}`,
      sourceKey: (row) => `${row.profile.resolvedId}\u001f${row.item.resolvedId}`,
      values: (row) => ({ item_profile_id: row.profile.resolvedId, item_id: row.item.resolvedId, active: row.active }),
      insert: (tx, row) => tx`insert into public.profile_items ${tx(row)} returning id`.then(([value]) => value),
      update: (tx, id, row) => tx`update public.profile_items set ${tx(row)} where id = ${id}`,
      describe: (row) => `${row.item_profile_id} -> ${row.item_id}`,
    },
  ];
}

export async function synchronizeMaster(model, databaseUrl) {
  const parsedUrl = new URL(databaseUrl);
  const isLocal = ["localhost", "127.0.0.1"].includes(parsedUrl.hostname);
  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    ssl: isLocal ? false : "require",
    connect_timeout: 15,
    idle_timeout: 5,
  });

  try {
    return await sql.begin(async (tx) => {
      const warnings = [];
      const stats = {};
      for (const config of tableConfigurations(model.registries)) {
        stats[config.name] = await synchronizeRegistry(tx, config.registry, config, warnings);
      }
      return { stats, warnings };
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
