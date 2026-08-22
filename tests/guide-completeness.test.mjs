import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { rankGuideSearchItems } from "../app/lib/guide-search.ts";

const files = {
  stationGuide: new URL("../app/panduan/page.tsx", import.meta.url),
  adminGuide: new URL("../app/admin/panduan/page.tsx", import.meta.url),
  home: new URL("../app/page.tsx", import.meta.url),
  stationUi: [
    new URL("../app/LoginForm.tsx", import.meta.url),
    new URL("../app/InventoryApp.tsx", import.meta.url),
    new URL("../app/SiteMetadataForm.tsx", import.meta.url),
    new URL("../app/AccountProblem.tsx", import.meta.url),
    new URL("../app/RuntimeMasterProblem.tsx", import.meta.url),
    new URL("../app/hooks/useServerDraft.ts", import.meta.url),
  ],
  adminUi: [
    new URL("../app/admin/AdminDashboard.tsx", import.meta.url),
    new URL("../app/admin/AdminSubmissionMonitor.tsx", import.meta.url),
    new URL("../app/admin/AdminProducts.tsx", import.meta.url),
    new URL("../app/admin/AdminBulkExport.tsx", import.meta.url),
    new URL("../app/admin/ProductReferenceMoveDialog.tsx", import.meta.url),
    new URL("../app/admin/ProductMergeDialog.tsx", import.meta.url),
    new URL("../app/admin/ProductDeleteDialog.tsx", import.meta.url),
    new URL("../app/InventoryApp.tsx", import.meta.url),
    new URL("../app/lib/submission-monitoring.ts", import.meta.url),
  ],
  adminPages: [
    new URL("../app/admin/page.tsx", import.meta.url),
    new URL("../app/admin/inventory/page.tsx", import.meta.url),
    new URL("../app/admin/submissions/[id]/page.tsx", import.meta.url),
    new URL("../app/admin/panduan/page.tsx", import.meta.url),
  ],
};

const expectedStationSections = [
  "mulai-di-sini", "akun-stasiun", "lokasi-pengisian", "alur-pengisian",
  "metadata-aloptama", "kategori-dan-unit", "produk", "gudang", "penyimpanan",
  "unduh-data", "troubleshooting", "faq", "istilah", "yang-baru",
];

const expectedAdminSections = [
  "mulai-di-sini", "dashboard", "stasiun-pengisian", "submission", "lock",
  "akun-stasiun", "qc-produk", "master-produk", "penggunaan-produk",
  "pindahkan-referensi", "menggabungkan-produk", "produk-tidak-digunakan",
  "alias-riwayat", "site-subtipe", "export-admin", "audit-admin",
  "troubleshooting", "faq", "istilah", "yang-baru",
];

async function readMany(urls) {
  return (await Promise.all(urls.map((url) => readFile(url, "utf8")))).join("\n");
}

function literalIds(source) {
  return [...source.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
}

function sectionIds(source) {
  return [...source.matchAll(/<section id="([^"]+)"/g)].map((match) => match[1]);
}

function fragmentReferences(source) {
  return [...source.matchAll(/["']#([a-z0-9-]+)["']/gi)].map((match) => match[1]);
}

function plainText(value) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^{}]*\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSearchItems(source) {
  const sections = [...source.matchAll(/<section id="([^"]+)"/g)];
  return sections.map((match, order) => {
    const start = match.index;
    const end = sections[order + 1]?.index ?? source.length;
    const block = source.slice(start, end);
    const openingTag = block.slice(0, block.indexOf(">") + 1);
    const title = plainText(block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? "");
    const category = plainText(block.match(/className="guide-section-label"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "");
    const subheadings = [...block.matchAll(/<(?:h4|dt)[^>]*>([\s\S]*?)<\/(?:h4|dt)>/g)]
      .map((heading) => plainText(heading[1]));
    const keywordMatch = openingTag.match(/data-guide-keywords="([^"]*)"/);
    return {
      id: match[1],
      title,
      category,
      subheadings,
      body: plainText(block),
      keywords: keywordMatch?.[1] ?? "",
      taskText: "",
      order,
    };
  });
}

function assertGuideStructure(source, expectedSections, audience) {
  const ids = [...literalIds(source), "yang-baru"];
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicateIds, [], `${audience} Guide mempunyai ID duplikat`);
  for (const id of expectedSections) assert.ok(ids.includes(id), `${audience} Guide kehilangan #${id}`);
  for (const target of fragmentReferences(source)) {
    assert.ok(ids.includes(target), `${audience} Guide mempunyai anchor tanpa target: #${target}`);
  }
  assert.equal((source.match(/<h1[ >]/g) ?? []).length, 1, `${audience} Guide harus mempunyai satu h1`);
  assert.equal((source.match(/<h2[ >]/g) ?? []).length, 1, `${audience} Guide harus mempunyai satu h2 judul halaman`);
  for (const id of sectionIds(source)) {
    const start = source.indexOf(`<section id="${id}"`);
    const end = source.indexOf("<section id=", start + 1);
    const block = source.slice(start, end < 0 ? source.length : end);
    assert.match(block, /<h3(?:\s|>)/, `Section #${id} harus mempunyai heading h3`);
  }
}

test("route user-facing mempunyai coverage Guide dan guard Admin tetap ada", async () => {
  const [home, stationGuide, adminGuide, adminPages] = await Promise.all([
    readFile(files.home, "utf8"),
    readFile(files.stationGuide, "utf8"),
    readFile(files.adminGuide, "utf8"),
    readMany(files.adminPages),
  ]);
  for (const component of ["LoginForm", "AccountProblem", "RuntimeMasterProblem", "InventoryApp"])
    assert.match(home, new RegExp(component));
  for (const section of expectedStationSections.slice(0, -1)) assert.match(stationGuide, new RegExp(`id="${section}"`));
  for (const section of expectedAdminSections.slice(0, -1)) assert.match(adminGuide, new RegExp(`id="${section}"`));
  assert.match(adminPages, /AdminDashboard/);
  assert.match(adminPages, /InventoryApp/);
  assert.match(adminPages, /super_admins/);
  assert.match(adminPages, /redirect\("\/"\)/);
});

test("anchor, ID, dan heading Guide valid tanpa duplikasi", async () => {
  const [stationGuide, adminGuide] = await Promise.all([
    readFile(files.stationGuide, "utf8"),
    readFile(files.adminGuide, "utf8"),
  ]);
  assertGuideStructure(stationGuide, expectedStationSections, "Station");
  assertGuideStructure(adminGuide, expectedAdminSections, "Admin");
});

test("label tindakan utama sama-sama ada di UI dan Guide", async () => {
  const [stationGuide, adminGuide, stationUi, adminUi] = await Promise.all([
    readFile(files.stationGuide, "utf8"),
    readFile(files.adminGuide, "utf8"),
    readMany(files.stationUi),
    readMany(files.adminUi),
  ]);
  for (const label of [
    "Masuk", "Keluar", "Mulai Pengisian", "Edit Data", "Simpan", "Selesai Mengedit",
    "+ Tambah Kategori Barang", "Pilih produk", "Pilih bahan", "Usulkan produk baru",
    "Unduh CSV", "Unduh JSON", "Coba lagi", "Muat versi terbaru", "Ambil alih draf",
  ]) {
    assert.ok(stationUi.includes(label), `UI Station tidak mempunyai label ${label}`);
    assert.ok(stationGuide.includes(label), `Station Guide belum menjelaskan label ${label}`);
  }
  for (const label of [
    "Muat ulang", "Buka", "Unduh", "Edit sebagai Admin", "Arsipkan Submission",
    "Pulihkan Submission", "Hapus Permanen", "Provision akun", "Reset Password",
    "Paksa Lepas Lock", "Approve Baru", "Merge", "Tolak", "Tambah Produk", "Edit",
    "Nonaktifkan", "Aktifkan", "Lihat Riwayat", "Pindahkan Referensi", "Gabungkan Produk",
    "Lihat Keterkaitan", "Bulk Download",
  ]) {
    assert.ok(adminUi.includes(label), `UI Admin tidak mempunyai label ${label}`);
    assert.ok(adminGuide.includes(label), `Admin Guide belum menjelaskan label ${label}`);
  }
});

test("status user-facing dan seluruh field metadata tercakup", async () => {
  const [stationGuide, adminGuide, stationUi, adminUi] = await Promise.all([
    readFile(files.stationGuide, "utf8"),
    readFile(files.adminGuide, "utf8"),
    readMany(files.stationUi),
    readMany(files.adminUi),
  ]);
  for (const status of [
    "Mode pengisian aktif", "Tersimpan di server", "Tersimpan lokal",
    "Ada perubahan belum tersinkron", "Ada versi server yang lebih baru",
    "Konfigurasi Site sedang diperbarui", "Subtipe tidak sesuai dengan konfigurasi Site",
  ]) {
    assert.ok(stationUi.includes(status), `UI Station tidak mempunyai status ${status}`);
    assert.ok(stationGuide.includes(status), `Station Guide belum menjelaskan status ${status}`);
  }
  for (const status of [
    "Aktif", "Diarsipkan", "Kosong", "Terisi Sebagian", "Lengkap", "Gudang",
    "Belum terpetakan", "PENDING", "APPROVED", "MERGED", "REJECTED",
    "Nonaktif", "Digabungkan",
  ]) {
    assert.ok(adminUi.includes(status), `UI Admin tidak mempunyai status ${status}`);
    assert.ok(adminGuide.includes(status), `Admin Guide belum menjelaskan status ${status}`);
  }
  for (const field of [
    "Nama Stasiun", "Equipment Type", "Field/Domain", "UPT Pengelola",
    "Sumber Anggaran Pemeliharaan", "Merk Pengadaan", "WIGOS ID", "AWS Center ID",
    "Status Kepemilikan", "Status Kepemilikan Lainnya", "Kode BMN (NUP)",
    "Tanggal Instalasi", "Status", "Alamat Detail", "Nama Provinsi", "Kab/Kota",
    "Kecamatan", "Desa/Kelurahan", "Nama Instansi Mitra", "Alamat Instansi",
    "Nama Penjaga", "No HP Penjaga", "Latitude", "Longitude", "Elevasi (meter)",
    "Metode Ukur", "Metode Ukur Lainnya", "Tanggal Ukur", "No SIM/GSM",
    "Metode Transport", "Zona Waktu", "Nama Teknisi", "No HP Teknisi",
    "Instansi Teknisi", "Mulai Interval", "Akhir Interval", "Interval Data (menit)",
    "Interval Lainnya (menit)",
  ]) {
    assert.ok(stationUi.includes(field), `Form tidak mempunyai field ${field}`);
    assert.ok(stationGuide.includes(field), `Station Guide belum menjelaskan field ${field}`);
  }
});

test("klarifikasi bisnis dan kebijakan tetap netral", async () => {
  const [stationGuide, adminGuide] = await Promise.all([
    readFile(files.stationGuide, "utf8"),
    readFile(files.adminGuide, "utf8"),
  ]);
  assert.match(stationGuide, /AWS Center ID[\s\S]*Aplikasi belum menetapkan definisi atau sumber resmi/);
  assert.match(stationGuide, /Mulai Interval dan Akhir Interval[\s\S]*Aplikasi belum menetapkan arti bisnis resmi/);
  assert.match(adminGuide, /Aplikasi tidak menetapkan pihak pemberi persetujuan; ikuti ketentuan internal yang berlaku/);
  assert.match(adminGuide, /Aplikasi tidak menetapkan kanal pengiriman resmi; ikuti ketentuan internal yang berlaku/);
  assert.match(adminGuide, /Aplikasi tidak menetapkan penanggung jawab rekonsiliasi[\s\S]*Ikuti ketentuan internal yang berlaku/);
});

test("pencarian representatif mengarah ke section yang valid dan terisolasi", async () => {
  const [stationGuide, adminGuide] = await Promise.all([
    readFile(files.stationGuide, "utf8"),
    readFile(files.adminGuide, "utf8"),
  ]);
  const stationItems = extractSearchItems(stationGuide);
  const adminItems = extractSearchItems(adminGuide);
  const stationIds = new Set(stationItems.map((item) => item.id));
  const adminIds = new Set(adminItems.map((item) => item.id));
  for (const query of ["login", "site", "subtipe", "serial", "unit", "gudang", "produk tidak ada", "data sedang diedit", "simpan", "csv", "json", "masalah"]) {
    const results = rankGuideSearchItems(stationItems, query);
    assert.ok(results.length, `Station search tidak menemukan ${query}`);
    for (const result of results) assert.ok(stationIds.has(result.id));
  }
  for (const query of ["progress", "submission", "arsip", "lock", "akun", "reset password", "qc", "approve", "merge qc", "alias", "produk salah", "pindahkan", "produk sama", "gabungkan", "nonaktifkan", "hapus permanen", "0 referensi", "audit", "site subtipe"]) {
    const results = rankGuideSearchItems(adminItems, query);
    assert.ok(results.length, `Admin search tidak menemukan ${query}`);
    for (const result of results) assert.ok(adminIds.has(result.id));
  }
  assert.equal(rankGuideSearchItems(stationItems, "hapus permanen produk").some((item) => item.id === "produk-tidak-digunakan"), false);
  assert.equal(rankGuideSearchItems(adminItems, "inventaris gudang").some((item) => item.id === "gudang"), false);
});
