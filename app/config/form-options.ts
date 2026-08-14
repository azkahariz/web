/**
 * Pilihan yang tampil pada form.
 *
 * File ini sengaja hanya berisi daftar sederhana agar dapat diubah tanpa
 * menyentuh logika aplikasi. Ikuti bentuk teks yang sudah ada saat menambah
 * atau menghapus pilihan.
 */

export const SITE_CONDITION_OPTIONS = [
  "Baik",
  "Rusak",
] as const;

export const WAREHOUSE_CONDITION_OPTIONS = ["Baik"] as const;
export const CONDITION_OPTIONS = SITE_CONDITION_OPTIONS;

export function getConditionOptions(warehouseMode: boolean) {
  return warehouseMode ? WAREHOUSE_CONDITION_OPTIONS : SITE_CONDITION_OPTIONS;
}

export const MOUNTING_MATERIALS = [
  "Besi galvanis",
  "Stainless steel",
  "Aluminium",
  "Besi",
  "PVC",
  "Fiberglass",
] as const;

export const MAINTENANCE_BUDGET_OPTIONS = ["3347", "3352"] as const;

export const FIELD_DOMAIN_SITE_TYPES = {
  Meteorologi: [
    "AWOS Kategori III",
    "AWOS Kategori II",
    "AWOS Kategori I",
    "Digitalisasi Taman Alat Meteorologi",
    "AWS Rekayasa",
    "AWS Maritim",
    "Water Level",
    "Radar EEC",
    "Radar Baron",
    "Radar Vaisala",
    "Radar Gematronik",
  ],
  Klimatologi: [
    "AAWS",
    "AWS",
    "ARG",
    "ASRS",
    "Soil Moisture",
    "Iklim Mikro",
    "Digitalisasi Taman Alat Klimatologi",
  ],
  Geofisika: ["Seismograph InaTEWS"],
} as const;

export const OWNERSHIP_STATUS_OPTIONS = [
  "BMKG",
  "Sewa",
  "Hibah",
  "Kerjasama Mitra",
  "Lainnya",
] as const;

export const OPERATIONAL_STATUS_OPTIONS = [
  "OPERATIONAL",
  "TRIAL",
  "INACTIVE",
  "RETIRED",
] as const;

export const MEASUREMENT_METHOD_OPTIONS = [
  "Altimeter di smartphone/smartwatch",
  "Handheld GPS",
  "Altimeter Analog",
  "Topographic Map",
  "Survey Barometric",
  "Lainnya",
] as const;

export const TRANSPORT_METHOD_OPTIONS = [
  "MQTT",
  "HTTP POST",
  "FTP",
  "TCP/IP Direct",
] as const;

export const TIMEZONE_OPTIONS = [
  "WIB (UTC+7)",
  "WITA (UTC+8)",
  "WIT (UTC+9)",
] as const;

export const DATA_INTERVAL_OPTIONS = [
  { value: "1", label: "1 Menit" },
  { value: "2", label: "2 Menit" },
  { value: "5", label: "5 Menit" },
  { value: "10", label: "10 Menit" },
  { value: "60", label: "60 Menit" },
  { value: "Lainnya", label: "Lainnya" },
] as const;
