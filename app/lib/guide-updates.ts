export type GuideAudience = "station" | "admin";
export type GuideUpdateAudience = GuideAudience | "all";
export type GuideUpdateLevel = "minor" | "update" | "important";

export type GuideUpdate = {
  version: string;
  date: string;
  audience: GuideUpdateAudience;
  level: GuideUpdateLevel;
  title: string;
  summary: string;
};

export type GuideSeenStorage = Pick<Storage, "getItem" | "setItem">;

export const GUIDE_SEEN_EVENT = "aloptama-guide-seen";
export const GUIDE_SEEN_KEYS: Record<GuideAudience, string> = {
  station: "aloptama-guide-seen:station",
  admin: "aloptama-guide-seen:admin",
};

export const GUIDE_ROUTES: Record<GuideAudience, string> = {
  station: "/panduan",
  admin: "/admin/panduan",
};

// To publish a notice: add an entry, raise its version, choose the audience,
// then use "update" or "important". "minor" changes do not trigger BARU.
export const GUIDE_UPDATES: readonly GuideUpdate[] = [
  {
    version: "2026.08.22.1",
    date: "2026-08-22",
    audience: "all",
    level: "update",
    title: "Panduan sekarang lebih mudah dicari",
    summary: "Gunakan kolom pencarian untuk langsung menemukan langkah, penjelasan, FAQ, atau solusi masalah yang Anda butuhkan.",
  },
  {
    version: "2026.08.21.3",
    date: "2026-08-21",
    audience: "admin",
    level: "update",
    title: "Panduan Super Admin kini lebih lengkap",
    summary: "Langkah memeriksa Submission, QC Produk, Master Produk, Pindahkan Referensi, Gabungkan Produk, Nonaktifkan, Hapus Permanen, Site/Subtipe, dan Audit sekarang dijelaskan lebih rinci.",
  },
  {
    version: "2026.08.21.3",
    date: "2026-08-21",
    audience: "station",
    level: "update",
    title: "Panduan Pengguna kini lebih lengkap",
    summary: "Langkah dari masuk, memilih Site, mengisi peralatan dan Gudang, menyimpan, mengunduh, hingga mengatasi masalah sekarang dijelaskan lebih rinci.",
  },
  {
    version: "2026.08.21.2",
    date: "2026-08-21",
    audience: "station",
    level: "important",
    title: "Pemilihan Site dan Subtipe lebih aman",
    summary: "Aplikasi sekarang memastikan Subtipe sesuai dengan Site yang dipilih agar data tidak tersimpan pada kelompok yang salah.",
  },
  {
    version: "2026.08.21.2",
    date: "2026-08-21",
    audience: "station",
    level: "update",
    title: "Mencari Produk lebih mudah",
    summary: "Cari dengan Merk, Tipe, atau keduanya. Rekomendasi membantu menemukan Produk yang sudah ada sebelum Anda mengusulkan Produk baru.",
  },
  {
    version: "2026.08.21.2",
    date: "2026-08-21",
    audience: "station",
    level: "update",
    title: "Pengisian lebih aman",
    summary: "Perubahan disimpan otomatis, dan aplikasi memberi tahu jika data sedang diedit dari perangkat lain.",
  },
  {
    version: "2026.08.21.2",
    date: "2026-08-21",
    audience: "admin",
    level: "important",
    title: "Pemilihan Site dan Subtipe lebih aman",
    summary: "Aplikasi mencegah data dibuka atau disimpan pada Subtipe yang tidak sesuai dengan Site.",
  },
  {
    version: "2026.08.21.2",
    date: "2026-08-21",
    audience: "admin",
    level: "update",
    title: "Cek penggunaan Produk lebih lengkap",
    summary: "Lihat apakah Produk masih digunakan pada item, Site, Submission, hasil pemeriksaan, nama lain, atau arsip.",
  },
  {
    version: "2026.08.21.2",
    date: "2026-08-21",
    audience: "admin",
    level: "update",
    title: "Produk yang salah dapat diperbaiki",
    summary: "Pindahkan item ke Produk yang benar atau gabungkan Produk yang sama tanpa menghilangkan data inventaris dan riwayat lama.",
  },
  {
    version: "2026.08.21.2",
    date: "2026-08-21",
    audience: "admin",
    level: "important",
    title: "Hapus Permanen hanya sebagai langkah terakhir",
    summary: "Jika Produk sudah tidak digunakan, sebaiknya cukup Nonaktifkan. Hapus Permanen hanya jika benar-benar diperlukan dan tidak ada data yang masih terkait.",
  },
  {
    version: "2026.08.21.2",
    date: "2026-08-21",
    audience: "admin",
    level: "update",
    title: "Daftar Produk lebih mudah dicari",
    summary: "Saring berdasarkan Status dan Sumber, lalu urutkan berdasarkan Merk, Tipe, Status, Sumber, atau Penggunaan.",
  },
] as const;

function appliesToAudience(update: GuideUpdate, audience: GuideAudience) {
  return update.audience === audience || update.audience === "all";
}

export function getGuideUpdates(audience: GuideAudience, updates: readonly GuideUpdate[] = GUIDE_UPDATES) {
  return updates
    .filter((update) => appliesToAudience(update, audience))
    .toSorted((left, right) => right.version.localeCompare(left.version) || right.date.localeCompare(left.date));
}

export function getLatestGuideUpdate(audience: GuideAudience, updates: readonly GuideUpdate[] = GUIDE_UPDATES) {
  return getGuideUpdates(audience, updates)[0] ?? null;
}

export function getLatestGuideNoticeVersion(audience: GuideAudience, updates: readonly GuideUpdate[] = GUIDE_UPDATES) {
  return getGuideUpdates(audience, updates).find((update) => update.level !== "minor")?.version ?? null;
}

export function isGuideNoticeUnseen(
  audience: GuideAudience,
  seenVersion: string | null,
  updates: readonly GuideUpdate[] = GUIDE_UPDATES,
) {
  const latestNoticeVersion = getLatestGuideNoticeVersion(audience, updates);
  return latestNoticeVersion !== null && latestNoticeVersion !== seenVersion;
}

export function getGuideNoticeHref(
  audience: GuideAudience,
  seenVersion: string | null,
  updates: readonly GuideUpdate[] = GUIDE_UPDATES,
) {
  return `${GUIDE_ROUTES[audience]}${isGuideNoticeUnseen(audience, seenVersion, updates) ? "#yang-baru" : ""}`;
}

export function readGuideSeenVersion(storage: GuideSeenStorage, audience: GuideAudience) {
  return storage.getItem(GUIDE_SEEN_KEYS[audience]);
}

export function markGuideNoticeSeen(
  storage: GuideSeenStorage,
  audience: GuideAudience,
  version = getLatestGuideNoticeVersion(audience),
) {
  if (!version) return null;
  storage.setItem(GUIDE_SEEN_KEYS[audience], version);
  return version;
}

export function formatGuideDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  return `${day} ${months[month - 1]} ${year}`;
}
