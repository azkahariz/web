import { FIELD_DOMAIN_SITE_TYPES } from "../config/form-options.ts";
import type { AutomaticMetadata, SiteMetadata } from "../types/site-metadata.ts";

export const EMPTY_SITE_METADATA: SiteMetadata = {
  maintenanceBudgetSource: "",
  procurementBrand: "",
  wigosId: "",
  awsCenterId: "",
  ownershipStatus: "",
  ownershipOther: "",
  bmnCode: "",
  installationDate: "",
  operationalStatus: "",
  detailAddress: "",
  provinceCode: "",
  cityCode: "",
  districtCode: "",
  villageCode: "",
  village: "",
  district: "",
  city: "",
  province: "",
  partnerAgencyName: "",
  partnerAgencyAddress: "",
  guardName: "",
  guardPhone: "",
  latitude: "",
  longitude: "",
  elevationMeters: "",
  measurementMethod: "",
  measurementDate: "",
  simNumber: "",
  transportMethods: [],
  timezone: "",
  technicianName: "",
  technicianPhone: "",
  technicianAgency: "",
  intervalStart: "",
  intervalEnd: "",
  dataInterval: "",
  dataIntervalOther: "",
};

export const SITE_METADATA_CSV_HEADERS = [
  "Sumber Anggaran Pemeliharaan",
  "Merk Pengadaan",
  "Field/Domain",
  "WIGOS ID",
  "AWS Center ID",
  "Status Kepemilikan",
  "Kode BMN (NUP)",
  "Tanggal Instalasi",
  "Status Operasional",
  "Alamat Detail",
  "Nama Provinsi",
  "Kode Provinsi",
  "Kab/Kota",
  "Kode Kab/Kota",
  "Kecamatan",
  "Kode Kecamatan",
  "Desa/Kelurahan",
  "Kode Desa/Kelurahan",
  "UPT Pengelola",
  "Nama Instansi Mitra",
  "Alamat Instansi",
  "Nama Penjaga",
  "No HP Penjaga",
  "Latitude",
  "Longitude",
  "Elevasi (meter)",
  "Metode Ukur",
  "Tanggal Ukur",
  "No SIM/GSM",
  "Metode Transport",
  "Zona Waktu",
  "Nama Teknisi",
  "No HP Teknisi",
  "Instansi Teknisi",
  "Mulai Interval",
  "Akhir Interval",
  "Interval Data (menit)",
] as const;

export function siteMetadataCsvValues(value: SiteMetadata, automatic: AutomaticMetadata) {
  return [
    value.maintenanceBudgetSource,
    value.procurementBrand,
    automatic.fieldDomain,
    value.wigosId,
    value.awsCenterId,
    value.ownershipStatus === "Lainnya" ? value.ownershipOther : value.ownershipStatus,
    value.bmnCode,
    value.installationDate,
    value.operationalStatus,
    value.detailAddress,
    value.province,
    value.provinceCode,
    value.city,
    value.cityCode,
    value.district,
    value.districtCode,
    value.village,
    value.villageCode,
    automatic.uptManager,
    value.partnerAgencyName,
    value.partnerAgencyAddress,
    value.guardName,
    value.guardPhone,
    value.latitude,
    value.longitude,
    value.elevationMeters,
    value.measurementMethod,
    value.measurementDate,
    value.simNumber,
    value.transportMethods.join("; "),
    value.timezone,
    value.technicianName,
    value.technicianPhone,
    value.technicianAgency,
    value.intervalStart,
    value.intervalEnd,
    value.dataInterval === "Lainnya" ? value.dataIntervalOther : value.dataInterval,
  ];
}

export function normalizeCoordinate(coordinate: string) {
  return coordinate.replace(",", ".").replace(/[^0-9.-]/g, "");
}

export function resolveFieldDomain(equipmentType: string): AutomaticMetadata["fieldDomain"] {
  if ((FIELD_DOMAIN_SITE_TYPES.Meteorologi as readonly string[]).includes(equipmentType)) {
    return "Meteorologi";
  }
  if ((FIELD_DOMAIN_SITE_TYPES.Klimatologi as readonly string[]).includes(equipmentType)) {
    return "Klimatologi";
  }
  if ((FIELD_DOMAIN_SITE_TYPES.Geofisika as readonly string[]).includes(equipmentType)) {
    return "Geofisika";
  }
  return "";
}
