import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getPublicSupabaseConfig } from "./supabase/config";
import { createSupabaseServerClient } from "./supabase/server";

type RpcError = { code?: string | null };

export type ProductMoveReference = {
  referenceType: "DIRECT";
  submissionId: string;
  expectedSubmissionVersion: number;
  itemId: string;
} | {
  referenceType: "QC_RESULT";
  proposalId: string;
  expectedProposalUpdatedAt: string;
};

export const PRODUCT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function productDependencyRpcError(error: RpcError, fallback: string) {
  if (error.code === "42501") return NextResponse.json({ error: "Akses Super Admin diperlukan." }, { status: 403 });
  if (error.code === "P0002") return NextResponse.json({ error: "Produk tidak ditemukan." }, { status: 404 });
  return NextResponse.json({ error: fallback }, { status: 400 });
}

export function parseProductMoveRequest(body: unknown): { targetProductId: string; references: ProductMoveReference[] } | null {
  if (!body || typeof body !== "object") return null;
  const value = body as { targetProductId?: unknown; references?: unknown };
  if (typeof value.targetProductId !== "string" || !PRODUCT_UUID_PATTERN.test(value.targetProductId)) return null;
  if (!Array.isArray(value.references) || value.references.length === 0 || value.references.length > 500) return null;
  const references = value.references.map((reference) => {
    if (!reference || typeof reference !== "object") return null;
    const row = reference as { referenceType?: unknown; submissionId?: unknown; expectedSubmissionVersion?: unknown; itemId?: unknown; proposalId?: unknown; expectedProposalUpdatedAt?: unknown };
    if (row.referenceType === "QC_RESULT") {
      if (typeof row.proposalId !== "string" || !PRODUCT_UUID_PATTERN.test(row.proposalId) || typeof row.expectedProposalUpdatedAt !== "string" || !row.expectedProposalUpdatedAt.trim()) return null;
      return { referenceType: "QC_RESULT" as const, proposalId: row.proposalId, expectedProposalUpdatedAt: row.expectedProposalUpdatedAt.trim() };
    }
    if (row.referenceType !== undefined && row.referenceType !== "DIRECT") return null;
    if (typeof row.submissionId !== "string" || !PRODUCT_UUID_PATTERN.test(row.submissionId)) return null;
    if (!Number.isInteger(row.expectedSubmissionVersion) || Number(row.expectedSubmissionVersion) < 0) return null;
    if (typeof row.itemId !== "string" || !row.itemId.trim() || row.itemId.length > 200) return null;
    return { referenceType: "DIRECT" as const, submissionId: row.submissionId, expectedSubmissionVersion: Number(row.expectedSubmissionVersion), itemId: row.itemId.trim() };
  });
  if (references.some((reference) => reference === null)) return null;
  return { targetProductId: value.targetProductId, references: references as ProductMoveReference[] };
}

export function productMoveConflictMessage(status: string) {
  if (status === "version_conflict") return "Data berubah sejak referensi dipilih. Tidak ada referensi yang dipindahkan. Muat ulang data lalu pilih kembali.";
  if (status === "active_lock") return "Sebagian data sedang diedit. Tidak ada referensi yang dipindahkan. Coba kembali setelah proses pengisian selesai.";
  if (status === "missing_item" || status === "source_mismatch" || status === "ambiguous_item" || status === "unsupported_reference") return "Referensi sudah berubah atau tidak dapat dipindahkan. Tidak ada data yang dipindahkan. Muat ulang daftar referensi.";
  if (status === "archived_submission") return "Submission sudah diarsipkan. Referensi arsip tidak dapat dipindahkan.";
  if (status === "target_inactive") return "Produk tujuan sudah tidak aktif. Pilih Produk tujuan lain.";
  if (status === "same_product") return "Produk tujuan harus berbeda dari Produk sumber.";
  if (status === "source_not_found" || status === "target_not_found" || status === "submission_not_found") return "Produk atau Submission tidak lagi tersedia.";
  return "Pilihan referensi tidak valid atau sudah berubah.";
}

export function parseProductMergeRequest(body: unknown, requireToken = false): { targetProductId: string; preflightToken?: string } | null {
  if (!body || typeof body !== "object") return null;
  const value = body as { targetProductId?: unknown; preflightToken?: unknown };
  if (typeof value.targetProductId !== "string" || !PRODUCT_UUID_PATTERN.test(value.targetProductId)) return null;
  if (requireToken && (typeof value.preflightToken !== "string" || !value.preflightToken.trim())) return null;
  if (value.preflightToken !== undefined && typeof value.preflightToken !== "string") return null;
  return { targetProductId: value.targetProductId, preflightToken: value.preflightToken?.trim() };
}

export function productMergeConflictMessage(status: string) {
  if (status === "active_lock") return "Sebagian Submission sedang diedit. Selesaikan pengisian atau tunggu lock kedaluwarsa sebelum menggabungkan Produk.";
  if (status === "state_changed") return "Data berubah setelah preflight. Tidak ada data yang diubah. Periksa kembali dampak merge.";
  if (status === "alias_collision") return "Salah satu nama atau alias Produk sumber sudah dimiliki Produk lain. Merge dibatalkan agar resolusi nama tidak ambigu.";
  if (status === "target_inactive") return "Produk tujuan sudah tidak aktif. Pilih Produk tujuan aktif lain.";
  if (status === "same_product") return "Produk tujuan harus berbeda dari Produk sumber.";
  if (status === "merge_cycle") return "Produk tujuan membentuk alur penggabungan yang berulang dan tidak dapat digunakan.";
  if (status === "source_already_merged") return "Produk sumber sudah digabungkan sebelumnya.";
  if (status === "source_not_found" || status === "target_not_found") return "Produk sumber atau tujuan tidak lagi tersedia.";
  return "Merge Produk tidak dapat dilanjutkan karena kondisi data sudah berubah.";
}

export function productDeleteConflictMessage(status: string) {
  if (status === "state_changed") return "Produk tidak dapat dihapus karena datanya telah berubah. Muat ulang informasi Produk dan periksa keterkaitannya kembali.";
  if (status === "already_deleted" || status === "not_found") return "Produk sudah tidak tersedia atau telah dihapus sebelumnya.";
  if (status === "database_dependency") return "Produk masih memiliki keterkaitan database yang harus dipertahankan. Muat ulang informasi Produk sebelum mencoba kembali.";
  if (status === "blocked") return "Produk belum memenuhi syarat untuk dihapus permanen.";
  return "Produk tidak dapat dihapus permanen karena kondisi datanya sudah berubah.";
}

export async function requireProductDependencyClient(request: Request): Promise<{ client: SupabaseClient } | { response: NextResponse }> {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const config = getPublicSupabaseConfig();
  const client = bearer && config
    ? createClient(config.url, config.publishableKey, { global: { headers: { Authorization: `Bearer ${bearer}` } }, auth: { autoRefreshToken: false, persistSession: false } })
    : await createSupabaseServerClient();
  if (!client) return { response: NextResponse.json({ error: "Konfigurasi Supabase belum tersedia." }, { status: 503 }) };
  const { data: userData } = await client.auth.getUser(bearer);
  if (!userData.user) return { response: NextResponse.json({ error: "Belum login." }, { status: 401 }) };
  return { client };
}
