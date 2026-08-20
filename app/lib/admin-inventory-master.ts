import type { SupabaseClient } from "@supabase/supabase-js";
import type { StationRuntimeMaster } from "../types/inventory";
import { parseStationRuntimeMaster } from "./station-runtime-master.ts";

export type AdminRuntimeMasterRows = {
  station: { id: string; name: string; active: boolean };
  sites: Array<{ id: string; station_id: string; site_type_id: string; name: string; active: boolean }>;
  siteTypes: Array<{ id: string; name: string; active: boolean }>;
  siteSubtypes: Array<{ id: string; site_type_id: string; item_profile_id: string | null; name: string; active: boolean }>;
  itemProfiles: Array<{ id: string; name: string; active: boolean }>;
  profileItems: Array<{ id: string; item_profile_id: string; item_id: string; active: boolean }>;
  items: Array<{ id: string; name: string; active: boolean }>;
  submissions: Array<{ site_id: string; site_subtype_id: string }>;
};

export class AdminRuntimeMasterError extends Error {}

function asRows<T>(result: { data: T[] | null; error: { message: string } | null }, label: string) {
  if (result.error) throw new AdminRuntimeMasterError(`${label}: ${result.error.message}`);
  return result.data ?? [];
}

async function loadAllRows<T>(loadPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const page = asRows(await loadPage(from, from + pageSize - 1), "Master runtime gagal dimuat");
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

/**
 * Converts active Supabase master rows into the exact runtime shape consumed by
 * InventoryApp. Station User reaches the same parser through its scoped RPC.
 */
export function buildAdminRuntimeMaster(source: AdminRuntimeMasterRows): StationRuntimeMaster {
  if (!source.station.active) throw new AdminRuntimeMasterError("Stasiun target tidak aktif.");
  const typeById = new Map(source.siteTypes.filter((row) => row.active).map((row) => [row.id, row]));
  const sites = source.sites.filter((row) => row.active && row.station_id === source.station.id && typeById.has(row.site_type_id));
  const profileById = new Map(source.itemProfiles.filter((row) => row.active).map((row) => [row.id, row]));
  const siteTypeIds = new Set(sites.map((row) => row.site_type_id));
  const subtypes = source.siteSubtypes.filter((row) => row.active && siteTypeIds.has(row.site_type_id)
    && row.item_profile_id && profileById.has(row.item_profile_id));
  const profileIds = new Set(subtypes.map((row) => row.item_profile_id!));
  const itemById = new Map(source.items.filter((row) => row.active).map((row) => [row.id, row]));
  const profileItems = source.profileItems.filter((row) => row.active && profileIds.has(row.item_profile_id) && itemById.has(row.item_id));
  const legacySubmissionSubtypeIdsBySite: Record<string, string[]> = {};
  for (const submission of source.submissions) {
    const values = legacySubmissionSubtypeIdsBySite[submission.site_id] ?? [];
    if (!values.includes(submission.site_subtype_id)) values.push(submission.site_subtype_id);
    legacySubmissionSubtypeIdsBySite[submission.site_id] = values;
  }

  return parseStationRuntimeMaster({
    station: { id: source.station.id, name: source.station.name },
    sites: sites.map((site) => ({
      id: site.id,
      stationId: site.station_id,
      name: site.name,
      siteTypeId: site.site_type_id,
      siteTypeName: typeById.get(site.site_type_id)!.name,
    })),
    siteSubtypes: subtypes.map((subtype) => ({
      id: subtype.id,
      siteTypeId: subtype.site_type_id,
      siteTypeName: typeById.get(subtype.site_type_id)!.name,
      name: subtype.name,
      profileId: subtype.item_profile_id!,
      profileName: profileById.get(subtype.item_profile_id!)!.name,
    })),
    itemProfiles: [...profileIds].map((id) => ({ id, name: profileById.get(id)!.name })),
    profileItems: profileItems.map((mapping) => ({
      id: mapping.id,
      profileId: mapping.item_profile_id,
      profileName: profileById.get(mapping.item_profile_id)!.name,
      itemId: mapping.item_id,
      itemName: itemById.get(mapping.item_id)!.name,
    })),
    legacySubmissionSubtypeIdsBySite,
  });
}

export async function loadAdminRuntimeMaster(client: SupabaseClient, stationId: string): Promise<StationRuntimeMaster> {
  const stationResult = await client.from("stations").select("id, name, active").eq("id", stationId).maybeSingle();
  if (stationResult.error) throw new AdminRuntimeMasterError(`Stasiun target gagal dimuat: ${stationResult.error.message}`);
  if (!stationResult.data) throw new AdminRuntimeMasterError("Stasiun target tidak ditemukan.");
  const station = stationResult.data as AdminRuntimeMasterRows["station"];
  const sites = await loadAllRows((from, to) => client.from("sites")
    .select("id, station_id, site_type_id, name, active")
    .eq("station_id", stationId)
    .eq("active", true)
    .order("name")
    .order("id")
    .range(from, to) as unknown as PromiseLike<{ data: AdminRuntimeMasterRows["sites"] | null; error: { message: string } | null }>);
  const requestedTypeIds = [...new Set(sites.map((row) => row.site_type_id))];
  const siteTypes = requestedTypeIds.length
    ? asRows(await client.from("site_types").select("id, name, active").in("id", requestedTypeIds).eq("active", true), "Tipe Site gagal dimuat") as AdminRuntimeMasterRows["siteTypes"]
    : [];
  const typeIds = siteTypes.map((row) => row.id);
  const siteSubtypes = typeIds.length
    ? asRows(await client.from("site_subtypes").select("id, site_type_id, item_profile_id, name, active").in("site_type_id", typeIds).eq("active", true), "Subtipe Site gagal dimuat") as AdminRuntimeMasterRows["siteSubtypes"]
    : [];
  const requestedProfileIds = [...new Set(siteSubtypes.map((row) => row.item_profile_id).filter((id): id is string => Boolean(id)))];
  const itemProfiles = requestedProfileIds.length
    ? asRows(await client.from("item_profiles").select("id, name, active").in("id", requestedProfileIds).eq("active", true), "Profil barang gagal dimuat") as AdminRuntimeMasterRows["itemProfiles"]
    : [];
  const profileIds = itemProfiles.map((row) => row.id);
  const profileItems = profileIds.length
    ? await loadAllRows((from, to) => client.from("profile_items")
      .select("id, item_profile_id, item_id, active")
      .in("item_profile_id", profileIds)
      .eq("active", true)
      .order("id")
      .range(from, to) as unknown as PromiseLike<{ data: AdminRuntimeMasterRows["profileItems"] | null; error: { message: string } | null }>)
    : [];
  const itemIds = [...new Set(profileItems.map((row) => row.item_id))];
  const items = itemIds.length
    ? asRows(await client.from("items").select("id, name, active").in("id", itemIds).eq("active", true), "Kategori barang gagal dimuat") as AdminRuntimeMasterRows["items"]
    : [];
  const submissions = await loadAllRows((from, to) => client.from("submissions")
    .select("site_id, site_subtype_id")
    .eq("station_id", stationId)
    .is("archived_at", null)
    .order("id")
    .range(from, to) as unknown as PromiseLike<{ data: AdminRuntimeMasterRows["submissions"] | null; error: { message: string } | null }>);

  return buildAdminRuntimeMaster({ station, sites, siteTypes, siteSubtypes, itemProfiles, profileItems, items, submissions });
}
