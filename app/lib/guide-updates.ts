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
    version: "2026.08.21.1",
    date: "2026-08-21",
    audience: "station",
    level: "important",
    title: "Validasi Site dan Subtipe diperkuat",
    summary: "Pilihan Subtipe sekarang diperiksa terhadap Site yang dipilih agar keluarga AWOS tidak tertukar.",
  },
  {
    version: "2026.08.21.1",
    date: "2026-08-21",
    audience: "station",
    level: "update",
    title: "Pencarian Produk lebih membantu",
    summary: "Pencarian dan rekomendasi Produk dapat mengenali Merk, Tipe, kombinasi keduanya, serta variasi penulisan.",
  },
  {
    version: "2026.08.21.1",
    date: "2026-08-21",
    audience: "station",
    level: "update",
    title: "Alur pengisian dan penyimpanan diperjelas",
    summary: "Mode lihat, Edit Data, autosave, Simpan, dan Selesai Mengedit dirangkum agar lock dilepas dengan benar.",
  },
  {
    version: "2026.08.21.1",
    date: "2026-08-21",
    audience: "admin",
    level: "important",
    title: "Perlindungan keluarga Site dan Subtipe",
    summary: "Admin dan Station User sekarang memakai aturan server yang sama untuk pasangan Site dan Subtipe.",
  },
  {
    version: "2026.08.21.1",
    date: "2026-08-21",
    audience: "admin",
    level: "update",
    title: "Dependency dan Penggunaan Produk",
    summary: "Detail Produk menampilkan referensi langsung, Site aktif, Submission aktif, hasil QC, dan Alias.",
  },
  {
    version: "2026.08.21.1",
    date: "2026-08-21",
    audience: "admin",
    level: "update",
    title: "Pindahkan Referensi dan Gabungkan Produk",
    summary: "Referensi dapat dipindahkan atau digabungkan ke Produk canonical setelah preflight dependency.",
  },
  {
    version: "2026.08.21.1",
    date: "2026-08-21",
    audience: "admin",
    level: "important",
    title: "Hapus Permanen hanya sebagai langkah terakhir",
    summary: "Jika Produk sudah tidak digunakan, sebaiknya cukup dinonaktifkan. Hapus Permanen hanya digunakan jika benar-benar diperlukan dan seluruh dependency sudah kosong.",
  },
  {
    version: "2026.08.21.1",
    date: "2026-08-21",
    audience: "admin",
    level: "update",
    title: "Filter dan sorting Master Produk",
    summary: "Daftar Produk dapat difilter berdasarkan Status dan Sumber, lalu diurutkan tanpa kehilangan konteks halaman.",
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
