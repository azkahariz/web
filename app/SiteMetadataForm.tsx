"use client";

import { useState } from "react";
import {
  DATA_INTERVAL_OPTIONS,
  MAINTENANCE_BUDGET_OPTIONS,
  MEASUREMENT_METHOD_OPTIONS,
  OPERATIONAL_STATUS_OPTIONS,
  OWNERSHIP_STATUS_OPTIONS,
  TIMEZONE_OPTIONS,
  TRANSPORT_METHOD_OPTIONS,
} from "./config/form-options";
import {
  normalizeRegionCode,
  useRegionOptions,
  type RegionOption,
} from "./hooks/useRegionOptions";
import { normalizeCoordinate } from "./lib/site-metadata";
import type { AutomaticMetadata, SiteMetadata } from "./types/site-metadata";

type Props = {
  value: SiteMetadata;
  automatic: AutomaticMetadata;
  onChange: (next: SiteMetadata) => void;
  onReset: () => void;
};

export default function SiteMetadataForm({ value, automatic, onChange, onReset }: Props) {
  const [regionReloadToken, setRegionReloadToken] = useState(0);
  const [manualRegionEntry, setManualRegionEntry] = useState(false);
  const normalizedProvinceCode = normalizeRegionCode(value.provinceCode ?? "", 1);
  const normalizedCityCode = normalizeRegionCode(value.cityCode ?? "", 2);
  const normalizedDistrictCode = normalizeRegionCode(value.districtCode ?? "", 3);
  const normalizedVillageCode = normalizeRegionCode(value.villageCode ?? "", 4);
  const provinces = useRegionOptions("/provinces.json", regionReloadToken);
  const cities = useRegionOptions(normalizedProvinceCode ? `/regencies/${normalizedProvinceCode}.json` : null, regionReloadToken);
  const districts = useRegionOptions(normalizedCityCode ? `/districts/${normalizedCityCode}.json` : null, regionReloadToken);
  const villages = useRegionOptions(normalizedDistrictCode ? `/villages/${normalizedDistrictCode}.json` : null, regionReloadToken);
  const regionError = provinces.error || cities.error || districts.error || villages.error;
  const hasLegacyRegionNames = Boolean(
    (value.province && !value.provinceCode)
    || (value.city && !value.cityCode)
    || (value.district && !value.districtCode)
    || (value.village && !value.villageCode),
  );
  const regionEntryIsManual = manualRegionEntry || hasLegacyRegionNames;
  function update<K extends keyof SiteMetadata>(key: K, nextValue: SiteMetadata[K]) {
    onChange({ ...value, [key]: nextValue });
  }

  function toggleTransport(method: string) {
    const next = value.transportMethods.includes(method)
      ? value.transportMethods.filter((item) => item !== method)
      : [...value.transportMethods, method];
    update("transportMethods", next);
  }

  function chooseRegion(
    codeKey: "provinceCode" | "cityCode" | "districtCode" | "villageCode",
    nameKey: "province" | "city" | "district" | "village",
    code: string,
    options: RegionOption[],
    clearedFields: Partial<SiteMetadata>,
  ) {
    const selected = options.find((option) => option.code === code);
    onChange({ ...value, [codeKey]: code, [nameKey]: selected?.name ?? "", ...clearedFields });
  }

  function useManualRegions() {
    setManualRegionEntry(true);
    onChange({
      ...value,
      provinceCode: "",
      cityCode: "",
      districtCode: "",
      villageCode: "",
    });
  }

  function useApiRegions() {
    setManualRegionEntry(false);
    onChange({
      ...value,
      provinceCode: "", province: "",
      cityCode: "", city: "",
      districtCode: "", district: "",
      villageCode: "", village: "",
    });
  }

  return (
    <section className="site-metadata-panel">
      <div className="site-metadata-head">
        <div className="panel-heading compact-heading">
          <span className="step-number">2</span>
          <div><p className="eyebrow">METADATA ALOPTAMA</p><h3>Lengkapi profil site</h3></div>
        </div>
        <p>{automatic.siteName}</p>
      </div>

      <details className="metadata-section" open>
        <summary><span>Identitas dan status</span><small>Pengadaan, ID, kepemilikan</small></summary>
        <div className="site-metadata-grid">
          <label>Nama Stasiun<input autoComplete="off" value={automatic.stationName} readOnly /></label>
          <label>Equipment Type<input autoComplete="off" value={automatic.equipmentType} readOnly /></label>
          <label>Field/Domain<input autoComplete="off" value={automatic.fieldDomain} readOnly /></label>
          <label>UPT Pengelola<input autoComplete="off" value={automatic.uptManager} readOnly /></label>
          <label>Sumber Anggaran Pemeliharaan
            <input autoComplete="off" list="budget-options" value={value.maintenanceBudgetSource} onChange={(event) => update("maintenanceBudgetSource", event.target.value)} placeholder="Contoh: 3347" />
            <datalist id="budget-options">
              {MAINTENANCE_BUDGET_OPTIONS.map((budget) => <option value={budget} key={budget} />)}
            </datalist>
          </label>
          <label>Merk Pengadaan<input autoComplete="off" value={value.procurementBrand} onChange={(event) => update("procurementBrand", event.target.value)} placeholder="Contoh: LSI, Microstep" /></label>
          <label>WIGOS ID
            <input autoComplete="off" value={value.wigosId} onChange={(event) => update("wigosId", event.target.value)} placeholder="0-360-04-36001" />
            <small>Konfirmasi ID ke Direktorat Data dan Komputasi.</small>
          </label>
          <label>AWS Center ID<input autoComplete="off" value={value.awsCenterId} onChange={(event) => update("awsCenterId", event.target.value)} placeholder="Contoh: STA2062" /></label>
          <label>Status Kepemilikan
            <select value={value.ownershipStatus} onChange={(event) => update("ownershipStatus", event.target.value)}>
              <option value="">Pilih status</option>
              {OWNERSHIP_STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>
          {value.ownershipStatus === "Lainnya" && <label>Status Kepemilikan Lainnya<input autoComplete="off" value={value.ownershipOther} onChange={(event) => update("ownershipOther", event.target.value)} /></label>}
          <label>Kode BMN (NUP)<input autoComplete="off" value={value.bmnCode} onChange={(event) => update("bmnCode", event.target.value)} placeholder="1.01.02.99.999.000804" /></label>
          <label>Tanggal Instalasi<input autoComplete="off" type="date" value={value.installationDate} onChange={(event) => update("installationDate", event.target.value)} /></label>
          <label>Status Operasional
            <select value={value.operationalStatus} onChange={(event) => update("operationalStatus", event.target.value)}>
              <option value="">Pilih status</option>
              {OPERATIONAL_STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>
        </div>
      </details>

      <details className="metadata-section">
        <summary><span>Lokasi dan pengelola</span><small>Alamat, mitra, penjaga</small></summary>
        <div className="site-metadata-grid">
          <label className="wide-field">Alamat Detail<textarea autoComplete="off" value={value.detailAddress} onChange={(event) => update("detailAddress", event.target.value)} placeholder="Jl. Bukit Golf I BSD Sektor VI" /></label>
          <div className="region-source-row wide-field">
            <span>Wilayah administratif</span>
            <button type="button" onClick={regionEntryIsManual ? useApiRegions : useManualRegions}>{regionEntryIsManual ? "Gunakan API wilayah" : "Input manual"}</button>
          </div>
          {regionEntryIsManual ? (
            <>
              <label>Nama Provinsi<input autoComplete="off" value={value.province} onChange={(event) => update("province", event.target.value)} /></label>
              <label>Kab/Kota<input autoComplete="off" value={value.city} onChange={(event) => update("city", event.target.value)} /></label>
              <label>Kecamatan<input autoComplete="off" value={value.district} onChange={(event) => update("district", event.target.value)} /></label>
              <label>Desa/Kelurahan<input autoComplete="off" value={value.village} onChange={(event) => update("village", event.target.value)} /></label>
            </>
          ) : (
            <>
              <label>Nama Provinsi
                <select
                  value={normalizedProvinceCode}
                  disabled={provinces.loading}
                  onChange={(event) => chooseRegion("provinceCode", "province", event.target.value, provinces.options, {
                    cityCode: "", city: "", districtCode: "", district: "", villageCode: "", village: "",
                  })}
                >
                  <option value="">{provinces.loading ? "Memuat provinsi..." : "Pilih provinsi"}</option>
                  {provinces.options.map((option) => <option value={option.code} key={option.code}>{option.name}</option>)}
                </select>
              </label>
              <label>Kab/Kota
                <select
                  value={normalizedCityCode}
                  disabled={!value.provinceCode || cities.loading}
                  onChange={(event) => chooseRegion("cityCode", "city", event.target.value, cities.options, {
                    districtCode: "", district: "", villageCode: "", village: "",
                  })}
                >
                  <option value="">{cities.loading ? "Memuat Kab/Kota..." : value.provinceCode ? "Pilih Kab/Kota" : "Pilih provinsi dahulu"}</option>
                  {cities.options.map((option) => <option value={option.code} key={option.code}>{option.name}</option>)}
                </select>
              </label>
              <label>Kecamatan
                <select
                  value={normalizedDistrictCode}
                  disabled={!value.cityCode || districts.loading}
                  onChange={(event) => chooseRegion("districtCode", "district", event.target.value, districts.options, {
                    villageCode: "", village: "",
                  })}
                >
                  <option value="">{districts.loading ? "Memuat kecamatan..." : value.cityCode ? "Pilih kecamatan" : "Pilih Kab/Kota dahulu"}</option>
                  {districts.options.map((option) => <option value={option.code} key={option.code}>{option.name}</option>)}
                </select>
              </label>
              <label>Desa/Kelurahan
                <select
                  value={normalizedVillageCode}
                  disabled={!value.districtCode || villages.loading}
                  onChange={(event) => chooseRegion("villageCode", "village", event.target.value, villages.options, {})}
                >
                  <option value="">{villages.loading ? "Memuat Desa/Kelurahan..." : value.districtCode ? "Pilih Desa/Kelurahan" : "Pilih kecamatan dahulu"}</option>
                  {villages.options.map((option) => <option value={option.code} key={option.code}>{option.name}</option>)}
                </select>
              </label>
              {regionError && (
                <div className="region-error wide-field">
                  <span>Data wilayah belum dapat dimuat.</span>
                  <button type="button" onClick={() => setRegionReloadToken((current) => current + 1)}>Coba lagi</button>
                  <button type="button" onClick={useManualRegions}>Input manual</button>
                </div>
              )}
            </>
          )}
          <label>Nama Instansi Mitra<input autoComplete="off" value={value.partnerAgencyName} onChange={(event) => update("partnerAgencyName", event.target.value)} placeholder="Contoh: BPTPHP Banten" /></label>
          <label className="wide-field">Alamat Instansi<textarea autoComplete="off" value={value.partnerAgencyAddress} onChange={(event) => update("partnerAgencyAddress", event.target.value)} placeholder="Gedung A, Jl. Raya Serang Km. 4" /></label>
          <label>Nama Penjaga<input autoComplete="off" value={value.guardName} onChange={(event) => update("guardName", event.target.value)} /></label>
          <label>No HP Penjaga<input autoComplete="off" inputMode="tel" value={value.guardPhone} onChange={(event) => update("guardPhone", event.target.value)} placeholder="081312345678" /></label>
        </div>
      </details>

      <details className="metadata-section">
        <summary><span>Koordinat dan pengukuran</span><small>Posisi, elevasi, metode ukur</small></summary>
        <div className="site-metadata-grid">
          <label>Latitude
            <input autoComplete="off" inputMode="decimal" value={value.latitude} onChange={(event) => update("latitude", normalizeCoordinate(event.target.value))} placeholder="-6.2792" />
            <small>Gunakan titik sebagai pemisah desimal.</small>
          </label>
          <label>Longitude
            <input autoComplete="off" inputMode="decimal" value={value.longitude} onChange={(event) => update("longitude", normalizeCoordinate(event.target.value))} placeholder="106.6503" />
            <small>Gunakan titik sebagai pemisah desimal.</small>
          </label>
          <label>Elevasi (meter)<input autoComplete="off" inputMode="decimal" value={value.elevationMeters} onChange={(event) => update("elevationMeters", event.target.value.replace(",", "."))} placeholder="32" /></label>
          <label>Metode Ukur
            <select value={value.measurementMethod} onChange={(event) => update("measurementMethod", event.target.value)}>
              <option value="">Pilih metode</option>
              {MEASUREMENT_METHOD_OPTIONS.map((method) => <option key={method}>{method}</option>)}
            </select>
          </label>
          <label>Tanggal Ukur<input autoComplete="off" type="date" value={value.measurementDate} onChange={(event) => update("measurementDate", event.target.value)} /></label>
        </div>
      </details>

      <details className="metadata-section">
        <summary><span>Komunikasi dan interval</span><small>Transport data, teknisi, frekuensi</small></summary>
        <div className="site-metadata-grid">
          <label>No SIM/GSM<input autoComplete="off" inputMode="tel" value={value.simNumber} onChange={(event) => update("simNumber", event.target.value)} placeholder="08112345678" /></label>
          <fieldset className="transport-field wide-field">
            <legend>Metode Transport</legend>
            <div>{TRANSPORT_METHOD_OPTIONS.map((method) => <label key={method}><input type="checkbox" checked={value.transportMethods.includes(method)} onChange={() => toggleTransport(method)} />{method}</label>)}</div>
          </fieldset>
          <label>Zona Waktu
            <select value={value.timezone} onChange={(event) => update("timezone", event.target.value)}>
              <option value="">Pilih zona waktu</option>
              {TIMEZONE_OPTIONS.map((timezone) => <option key={timezone}>{timezone}</option>)}
            </select>
          </label>
          <label>Nama Teknisi<input autoComplete="off" value={value.technicianName} onChange={(event) => update("technicianName", event.target.value)} /></label>
          <label>No HP Teknisi<input autoComplete="off" inputMode="tel" value={value.technicianPhone} onChange={(event) => update("technicianPhone", event.target.value)} placeholder="085712345678" /></label>
          <label>Instansi Teknisi<input autoComplete="off" value={value.technicianAgency} onChange={(event) => update("technicianAgency", event.target.value)} placeholder="Contoh: Telkomsel" /></label>
          <label>Mulai Interval<input autoComplete="off" type="date" value={value.intervalStart} onChange={(event) => update("intervalStart", event.target.value)} /></label>
          <label>Akhir Interval<input autoComplete="off" type="date" value={value.intervalEnd} onChange={(event) => update("intervalEnd", event.target.value)} /></label>
          <label>Interval Data (menit)
            <select value={value.dataInterval} onChange={(event) => update("dataInterval", event.target.value)}>
              <option value="">Pilih interval</option>
              {DATA_INTERVAL_OPTIONS.map((interval) => <option value={interval.value} key={interval.value}>{interval.label}</option>)}
            </select>
          </label>
          {value.dataInterval === "Lainnya" && <label>Interval Lainnya (menit)<input autoComplete="off" type="number" min="1" value={value.dataIntervalOther} onChange={(event) => update("dataIntervalOther", event.target.value)} /></label>}
        </div>
      </details>

      <div className="metadata-actions">
        <span>Metadata tersimpan otomatis untuk site ini</span>
        <button className="danger-button" onClick={onReset}>Kosongkan metadata</button>
      </div>
    </section>
  );
}
