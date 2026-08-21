import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  GUIDE_SEEN_KEYS,
  getGuideNoticeHref,
  getGuideUpdates,
  getLatestGuideNoticeVersion,
  isGuideNoticeUnseen,
  markGuideNoticeSeen,
  readGuideSeenVersion,
} from "../app/lib/guide-updates.ts";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("Station unseen menampilkan notice dan menuju Yang Baru", () => {
  assert.equal(isGuideNoticeUnseen("station", "2026.08.20.1"), true);
  assert.equal(getGuideNoticeHref("station", "2026.08.20.1"), "/panduan#yang-baru");
});

test("Station seen menyembunyikan notice dan memakai route normal", () => {
  const latest = getLatestGuideNoticeVersion("station");
  assert.ok(latest);
  assert.equal(isGuideNoticeUnseen("station", latest), false);
  assert.equal(getGuideNoticeHref("station", latest), "/panduan");
});

test("perubahan struktur panduan memicu notice baru untuk kedua audience", () => {
  assert.equal(getLatestGuideNoticeVersion("station"), "2026.08.21.2");
  assert.equal(getLatestGuideNoticeVersion("admin"), "2026.08.21.2");
  assert.equal(isGuideNoticeUnseen("station", "2026.08.21.1"), true);
  assert.equal(isGuideNoticeUnseen("admin", "2026.08.21.1"), true);
});

test("Admin mempunyai notice dan seen-state terpisah dari Station", () => {
  const storage = memoryStorage();
  const stationVersion = markGuideNoticeSeen(storage, "station");
  assert.equal(readGuideSeenVersion(storage, "station"), stationVersion);
  assert.equal(readGuideSeenVersion(storage, "admin"), null);
  assert.equal(isGuideNoticeUnseen("admin", readGuideSeenVersion(storage, "admin")), true);
  assert.notEqual(GUIDE_SEEN_KEYS.station, GUIDE_SEEN_KEYS.admin);
});

test("minor tidak memicu notice sedangkan update dan important memicu", () => {
  const minor = [{ version: "1", date: "2026-08-21", audience: "station", level: "minor", title: "Typo", summary: "Wording" }];
  const update = [{ ...minor[0], version: "2", level: "update" }];
  const important = [{ ...minor[0], version: "3", level: "important" }];
  assert.equal(getLatestGuideNoticeVersion("station", minor), null);
  assert.equal(isGuideNoticeUnseen("station", null, minor), false);
  assert.equal(isGuideNoticeUnseen("station", null, update), true);
  assert.equal(isGuideNoticeUnseen("station", null, important), true);
});

test("mark seen menyimpan latest notice version secara idempotent", () => {
  const storage = memoryStorage();
  const latest = getLatestGuideNoticeVersion("admin");
  assert.equal(markGuideNoticeSeen(storage, "admin"), latest);
  assert.equal(markGuideNoticeSeen(storage, "admin"), latest);
  assert.equal(readGuideSeenVersion(storage, "admin"), latest);
});

test("link notice, anchor, dan accessibility memakai shared implementation", async () => {
  const [link, section, stationApp, adminDashboard, stationGuide, adminGuide, styles] = await Promise.all([
    readFile(new URL("../app/components/GuideNoticeLink.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/GuideUpdatesSection.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/panduan/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/panduan/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(link, /<Link[\s\S]*aria-label=/);
  assert.match(link, /guide-new-badge/);
  assert.match(link, /GUIDE_SEEN_EVENT/);
  assert.match(section, /id="yang-baru"/);
  assert.match(section, /window\.location\.hash === "#yang-baru"/);
  assert.match(section, /markGuideNoticeSeen\(window\.localStorage/);
  assert.match(stationApp, /GuideNoticeLink audience=\{isAdminEditor \? "admin" : "station"\}/);
  assert.match(adminDashboard, /GuideNoticeLink audience="admin"/);
  assert.match(stationGuide, /GuideUpdatesSection audience="station"/);
  assert.match(adminGuide, /GuideUpdatesSection audience="admin"/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.guide-notice-link\.is-unseen \{ animation: none; \}/);
  assert.match(styles, /\.guide-notice-link:focus-visible/);
  assert.match(styles, /\.topbar > \.account-actions \{ margin-left: auto; justify-content: flex-end; flex-wrap: wrap; \}/);
});

test("panduan Station memakai navigasi berbasis pekerjaan dan langkah pengguna", async () => {
  const source = await readFile(new URL("../app/panduan/page.tsx", import.meta.url), "utf8");
  assert.match(source, /Mau melakukan apa\?/);
  assert.match(source, /Mulai mengisi data/);
  assert.match(source, /Melanjutkan pengisian/);
  assert.match(source, /Memilih atau mengusulkan Produk/);
  assert.match(source, /Bagaimana cara mengisi atau memperbaiki data\?/);
  assert.match(source, /Mulai Pengisian/);
  assert.match(source, /Selesai Mengedit/);
  assert.match(source, /Usulkan produk baru/);
  assert.match(source, /Unduh CSV/);
  assert.match(source, /Coba lagi/);
});

test("panduan Admin menjelaskan pekerjaan dan tindakan Produk berisiko", async () => {
  const source = await readFile(new URL("../app/admin/panduan/page.tsx", import.meta.url), "utf8");
  assert.match(source, /Mau melakukan apa\?/);
  assert.match(source, /Melihat progres pengisian/);
  assert.match(source, /Memeriksa usulan Produk/);
  assert.match(source, /Bagaimana mengecek Produk masih digunakan atau tidak\?/);
  assert.match(source, /Pindahkan Referensi/);
  assert.match(source, /Ada dua Produk yang sebenarnya sama/);
  assert.match(source, /Jika Produk sudah tidak digunakan, sebaiknya cukup <strong>Nonaktifkan<\/strong>/);
  assert.match(source, /Hapus Permanen tidak dapat dibatalkan melalui aplikasi/);
  assert.match(source, /0 referensi<\/strong> tidak otomatis berarti Produk harus atau boleh dihapus/);
});

test("Yang Baru memakai bahasa umum tanpa jargon developer", async () => {
  const [stationGuide, adminGuide, registry] = await Promise.all([
    readFile(new URL("../app/panduan/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/panduan/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/guide-updates.ts", import.meta.url), "utf8"),
  ]);
  const userVisibleGuide = `${stationGuide}\n${adminGuide}\n${registry}`;
  assert.doesNotMatch(userVisibleGuide, /\b(?:RPC|JSONB|UUID|TOCTOU)\b|canonical resolver|foreign key/i);
  assert.match(registry, /Pemilihan Site dan Subtipe lebih aman/);
  assert.match(registry, /Cek penggunaan Produk lebih lengkap/);
  assert.match(registry, /Produk yang salah dapat diperbaiki/);
  assert.equal(getGuideUpdates("station").length, 3);
  assert.equal(getGuideUpdates("admin").length, 5);
});
