import type { StationCompletionDetailRow } from "./station-completion.ts";
import { WAREHOUSE_SITE_TYPE_ID } from "./warehouse.ts";

export type UnifiedFillingMasterRow<TSite, TSiteType, TSubtype, TSubmission> = {
  site: TSite;
  siteType: TSiteType | null;
  subtype: TSubtype | null;
  submission: TSubmission | null;
};

export type UnifiedFillingRow<TSite, TSiteType, TSubtype, TSubmission> =
  UnifiedFillingMasterRow<TSite, TSiteType, TSubtype, TSubmission> & {
    key: string;
    completion: StationCompletionDetailRow | null;
    isWarehouse: boolean;
  };

type IdentifiedSite = { id: string; name: string };
type IdentifiedSiteType = { id: string; name: string };
type IdentifiedSubtype = { id: string; name: string };
type IdentifiedSubmission = { id: string; site_id: string; site_subtype_id: string };

export function fillingPairKey(siteId: string | null | undefined, subtypeId: string | null | undefined) {
  return `${siteId ?? "no-site"}:${subtypeId ?? "no-subtype"}`;
}

export function composeUnifiedFillingRows<
  TSite extends IdentifiedSite,
  TSiteType extends IdentifiedSiteType,
  TSubtype extends IdentifiedSubtype,
  TSubmission extends IdentifiedSubmission,
>(
  masterRows: Array<UnifiedFillingMasterRow<TSite, TSiteType, TSubtype, TSubmission>>,
  completionRows: StationCompletionDetailRow[],
) {
  const completionByPair = new Map<string, StationCompletionDetailRow>();
  for (const completion of completionRows) {
    const key = fillingPairKey(completion.site_id, completion.site_subtype_id);
    const existing = completionByPair.get(key);
    if (!existing || (!existing.is_expected && completion.is_expected)) completionByPair.set(key, completion);
  }

  const rows = new Map<string, UnifiedFillingRow<TSite, TSiteType, TSubtype, TSubmission>>();
  for (const master of masterRows) {
    const key = fillingPairKey(master.site.id, master.subtype?.id);
    rows.set(key, {
      ...master,
      key,
      completion: completionByPair.get(key) ?? null,
      isWarehouse: master.siteType?.id === WAREHOUSE_SITE_TYPE_ID,
    });
  }

  // Unexpected legacy rows are retained as attention items even if the pair is no longer in active master.
  for (const completion of completionRows) {
    const key = fillingPairKey(completion.site_id, completion.site_subtype_id);
    if (rows.has(key) || !completion.site_id || completion.is_expected) continue;
    const submission = masterRows
      .map((row) => row.submission)
      .find((candidate) => candidate?.id === completion.submission_id) ?? null;
    rows.set(key, {
      key,
      site: { id: completion.site_id, name: completion.site_name ?? "Site tidak ditemukan" } as TSite,
      siteType: completion.site_type_id ? {
        id: completion.site_type_id,
        name: completion.site_type_name ?? "Tipe Site tidak ditemukan",
      } as TSiteType : null,
      subtype: completion.site_subtype_id ? {
        id: completion.site_subtype_id,
        name: completion.subtype_name ?? "Subtipe tidak ditemukan",
      } as TSubtype : null,
      submission,
      completion,
      isWarehouse: completion.site_type_id === WAREHOUSE_SITE_TYPE_ID,
    });
  }

  return [...rows.values()].sort((left, right) => (
    Number(left.isWarehouse) - Number(right.isWarehouse)
    || left.site.name.localeCompare(right.site.name, "id-ID")
    || (left.subtype?.name ?? "").localeCompare(right.subtype?.name ?? "", "id-ID")
    || left.key.localeCompare(right.key)
  ));
}
