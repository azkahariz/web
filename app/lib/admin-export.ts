"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import rawData from "../data.generated.json";
import type { DataSet, InstalledItem, ProductProposal } from "../types/inventory";
import { buildStationFillingView, loadAllAdminRows, type AdminSite, type AdminSiteType, type AdminStation, type AdminSubtype } from "./admin-view";
import { buildAdminExportPlan, type AdminExportScope } from "./admin-export-plan";
import { downloadBlob, downloadText } from "./download";
import { buildInventoryCsv, createDefaultDraftPayload } from "./inventory-export";
import { resolveInstalledProduct } from "./product-qc";
import type { DraftPayload } from "./server-draft";
import { inventoryCategoryNames } from "./category-functions";
import { isWarehouseContext } from "./warehouse";

const generated = rawData as DataSet;

type SubmissionRow = {
  id: string;
  station_id: string;
  site_id: string;
  site_subtype_id: string;
  payload: DraftPayload | Record<string, never>;
};

type ProposalRow = {
  id: string;
  proposed_brand: string;
  proposed_model: string;
  status: ProductProposal["status"];
  resolved_product_id: string | null;
  review_note: string | null;
  resolved_product: { brand: string; model: string } | Array<{ brand: string; model: string }> | null;
};

function one<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function proposalMap(rows: ProposalRow[]) {
  return new Map(rows.map((row) => {
    const resolved = one(row.resolved_product);
    return [row.id, {
      id: row.id,
      proposedBrand: row.proposed_brand,
      proposedModel: row.proposed_model,
      status: row.status,
      resolvedProductId: row.resolved_product_id ?? undefined,
      resolvedBrand: resolved?.brand,
      resolvedModel: resolved?.model,
      reviewNote: row.review_note ?? undefined,
    } satisfies ProductProposal];
  }));
}

function exportDefinition(siteId: string, siteSubtypeId: string) {
  const site = generated.stationSites.find((row) => row.siteId === siteId);
  const subtype = generated.siteSubtypes.find((row) => row.subtypeId === siteSubtypeId);
  if (!site || !subtype) throw new Error("Definisi master export tidak ditemukan pada build aplikasi.");
  return {
    profile: subtype.profile,
    categories: generated.barangByJenis[subtype.profile] ?? [],
    warehouseMode: isWarehouseContext(site, subtype),
  };
}

export async function downloadAdminInventory({
  client,
  station,
  sites,
  siteTypes,
  subtypes,
  scope,
  submissionId,
}: {
  client: SupabaseClient;
  station: AdminStation;
  sites: AdminSite[];
  siteTypes: AdminSiteType[];
  subtypes: AdminSubtype[];
  scope: AdminExportScope;
  submissionId?: string;
}) {
  const [submissionResult, proposalResult] = await Promise.all([
    loadAllAdminRows((from, to) => {
      let query = client.from("submissions")
        .select("id, station_id, site_id, site_subtype_id, payload")
        .eq("station_id", scope.stationId);
      if (scope.siteId) query = query.eq("site_id", scope.siteId);
      if (scope.siteSubtypeId) query = query.eq("site_subtype_id", scope.siteSubtypeId);
      query = submissionId ? query.eq("id", submissionId) : query.is("archived_at", null);
      return query.order("updated_at").order("id").range(from, to);
    }),
    loadAllAdminRows((from, to) => client.from("product_proposals")
      .select("id, proposed_brand, proposed_model, status, resolved_product_id, review_note, resolved_product:products!product_proposals_resolved_product_id_fkey(brand, model)")
      .eq("station_id", scope.stationId)
      .order("created_at")
      .order("id")
      .range(from, to)),
  ]);
  if (submissionResult.error) throw new Error(submissionResult.error.message);
  if (proposalResult.error) throw new Error(proposalResult.error.message);

  const submissions = (submissionResult.data ?? []) as SubmissionRow[];
  const proposals = proposalMap((proposalResult.data ?? []) as ProposalRow[]);
  const view = buildStationFillingView(scope.stationId, sites, siteTypes, subtypes, submissions);
  const plan = buildAdminExportPlan(station, view.rows, scope);
  const files = plan.entries.map((row) => {
    const definition = exportDefinition(row.site.id, row.subtype!.id);
    const payload = row.submission?.payload && "schemaVersion" in row.submission.payload
      ? row.submission.payload as DraftPayload
      : createDefaultDraftPayload(scope.stationId, row.site.id, row.subtype!.id);
    const categories = definition.warehouseMode
      ? inventoryCategoryNames(payload.inventory).filter((category) => definition.categories.includes(category))
      : definition.categories;
    const resolveItem = (item: InstalledItem) => {
      if (item.itemKind === "material") return item;
      const resolved = resolveInstalledProduct(item, proposals);
      return { ...item, brand: resolved.brand, model: resolved.model };
    };
    return {
      filename: row.filename,
      csv: buildInventoryCsv({
        stationName: station.name,
        siteName: row.site.name,
        siteTypeName: row.siteType?.name ?? "Belum terpetakan",
        subtypeName: row.subtype!.name,
        profile: definition.profile,
        categories,
        payload,
        warehouseMode: definition.warehouseMode,
        resolveItem,
      }),
      hasSubmission: Boolean(row.submission),
    };
  });

  if (plan.kind === "csv") {
    downloadText(plan.filename, files[0].csv, "text/csv;charset=utf-8");
  } else {
    const { strToU8, zipSync } = await import("fflate");
    const archive = zipSync(Object.fromEntries(files.map((file) => [file.filename, strToU8(file.csv)])));
    downloadBlob(plan.filename, new Blob([archive as Uint8Array<ArrayBuffer>], { type: "application/zip" }));
  }

  return {
    kind: plan.kind,
    filename: plan.filename,
    fileCount: files.length,
    existingCount: files.filter((file) => file.hasSubmission).length,
    emptyCount: files.filter((file) => !file.hasSubmission).length,
  };
}
