export type SiteMetadata = {
  maintenanceBudgetSource: string;
  procurementBrand: string;
  wigosId: string;
  awsCenterId: string;
  ownershipStatus: string;
  ownershipOther: string;
  bmnCode: string;
  installationDate: string;
  operationalStatus: string;
  detailAddress: string;
  village: string;
  district: string;
  city: string;
  province: string;
  partnerAgencyName: string;
  partnerAgencyAddress: string;
  guardName: string;
  guardPhone: string;
  latitude: string;
  longitude: string;
  elevationMeters: string;
  measurementMethod: string;
  measurementDate: string;
  simNumber: string;
  transportMethods: string[];
  timezone: string;
  technicianName: string;
  technicianPhone: string;
  technicianAgency: string;
  intervalStart: string;
  intervalEnd: string;
  dataInterval: string;
  dataIntervalOther: string;
};

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
  "Desa/Kelurahan",
  "Kecamatan",
  "Kab/Kota",
  "Nama Provinsi",
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
];

const PROVINCES = [
  "Aceh", "Sumatera Utara", "Sumatera Barat", "Riau", "Kepulauan Riau",
  "Jambi", "Sumatera Selatan", "Kepulauan Bangka Belitung", "Bengkulu", "Lampung",
  "DKI Jakarta", "Banten", "Jawa Barat", "Jawa Tengah", "DI Yogyakarta", "Jawa Timur",
  "Bali", "Nusa Tenggara Barat", "Nusa Tenggara Timur", "Kalimantan Barat",
  "Kalimantan Tengah", "Kalimantan Selatan", "Kalimantan Timur", "Kalimantan Utara",
  "Sulawesi Utara", "Gorontalo", "Sulawesi Tengah", "Sulawesi Barat", "Sulawesi Selatan",
  "Sulawesi Tenggara", "Maluku", "Maluku Utara", "Papua", "Papua Barat",
  "Papua Selatan", "Papua Tengah", "Papua Pegunungan", "Papua Barat Daya",
];

const TRANSPORT_METHODS = ["MQTT", "HTTP POST", "FTP", "TCP/IP Direct"];

type AutomaticMetadata = {
  stationName: string;
  siteName: string;
  equipmentType: string;
  fieldDomain: "Meteorology";
  uptManager: string;
};

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
    value.village,
    value.district,
    value.city,
    value.province,
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

type Props = {
  value: SiteMetadata;
  automatic: AutomaticMetadata;
  cityOptions: string[];
  onChange: (next: SiteMetadata) => void;
  onReset: () => void;
};

export default function SiteMetadataForm({ value, automatic, cityOptions, onChange, onReset }: Props) {
  function update<K extends keyof SiteMetadata>(key: K, nextValue: SiteMetadata[K]) {
    onChange({ ...value, [key]: nextValue });
  }

  function toggleTransport(method: string) {
    const next = value.transportMethods.includes(method)
      ? value.transportMethods.filter((item) => item !== method)
      : [...value.transportMethods, method];
    update("transportMethods", next);
  }

  function normalizeCoordinate(coordinate: string) {
    return coordinate.replace(",", ".").replace(/[^0-9.-]/g, "");
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
          <label>Nama Stasiun<input value={automatic.stationName} readOnly /></label>
          <label>Equipment Type<input value={automatic.equipmentType} readOnly /></label>
          <label>Field/Domain<input value={automatic.fieldDomain} readOnly /></label>
          <label>UPT Pengelola<input value={automatic.uptManager} readOnly /></label>
          <label>Sumber Anggaran Pemeliharaan
            <input list="budget-options" value={value.maintenanceBudgetSource} onChange={(event) => update("maintenanceBudgetSource", event.target.value)} placeholder="Contoh: 3347" />
            <datalist id="budget-options"><option value="3347" /><option value="3352" /></datalist>
          </label>
          <label>Merk Pengadaan<input value={value.procurementBrand} onChange={(event) => update("procurementBrand", event.target.value)} placeholder="Contoh: LSI, Microstep" /></label>
          <label>WIGOS ID
            <input value={value.wigosId} onChange={(event) => update("wigosId", event.target.value)} placeholder="0-360-04-36001" />
            <small>Konfirmasi ID ke Direktorat Data dan Komputasi.</small>
          </label>
          <label>AWS Center ID<input value={value.awsCenterId} onChange={(event) => update("awsCenterId", event.target.value)} placeholder="Contoh: STA2062" /></label>
          <label>Status Kepemilikan
            <select value={value.ownershipStatus} onChange={(event) => update("ownershipStatus", event.target.value)}>
              <option value="">Pilih status</option><option>BMKG</option><option>Sewa</option><option>Hibah</option><option>Kerjasama Mitra</option><option>Lainnya</option>
            </select>
          </label>
          {value.ownershipStatus === "Lainnya" && <label>Status Kepemilikan Lainnya<input value={value.ownershipOther} onChange={(event) => update("ownershipOther", event.target.value)} /></label>}
          <label>Kode BMN (NUP)<input value={value.bmnCode} onChange={(event) => update("bmnCode", event.target.value)} placeholder="1.01.02.99.999.000804" /></label>
          <label>Tanggal Instalasi<input type="date" value={value.installationDate} onChange={(event) => update("installationDate", event.target.value)} /></label>
          <label>Status Operasional
            <select value={value.operationalStatus} onChange={(event) => update("operationalStatus", event.target.value)}>
              <option value="">Pilih status</option><option>OPERATIONAL</option><option>TRIAL</option><option>INACTIVE</option><option>RETIRED</option>
            </select>
          </label>
        </div>
      </details>

      <details className="metadata-section">
        <summary><span>Lokasi dan pengelola</span><small>Alamat, mitra, penjaga</small></summary>
        <div className="site-metadata-grid">
          <label className="wide-field">Alamat Detail<textarea value={value.detailAddress} onChange={(event) => update("detailAddress", event.target.value)} placeholder="Jl. Bukit Golf I BSD Sektor VI" /></label>
          <label>Desa/Kelurahan<input value={value.village} onChange={(event) => update("village", event.target.value)} /></label>
          <label>Kecamatan<input value={value.district} onChange={(event) => update("district", event.target.value)} /></label>
          <label>Kab/Kota
            <input list="city-options" value={value.city} onChange={(event) => update("city", event.target.value)} placeholder="Pilih atau ketik Kab/Kota" />
            <datalist id="city-options">{cityOptions.map((city) => <option value={city} key={city} />)}</datalist>
          </label>
          <label>Nama Provinsi
            <select value={value.province} onChange={(event) => update("province", event.target.value)}>
              <option value="">Pilih provinsi</option>{PROVINCES.map((province) => <option key={province}>{province}</option>)}
            </select>
          </label>
          <label>Nama Instansi Mitra<input value={value.partnerAgencyName} onChange={(event) => update("partnerAgencyName", event.target.value)} placeholder="Contoh: BPTPHP Banten" /></label>
          <label className="wide-field">Alamat Instansi<textarea value={value.partnerAgencyAddress} onChange={(event) => update("partnerAgencyAddress", event.target.value)} placeholder="Gedung A, Jl. Raya Serang Km. 4" /></label>
          <label>Nama Penjaga<input value={value.guardName} onChange={(event) => update("guardName", event.target.value)} /></label>
          <label>No HP Penjaga<input inputMode="tel" value={value.guardPhone} onChange={(event) => update("guardPhone", event.target.value)} placeholder="081312345678" /></label>
        </div>
      </details>

      <details className="metadata-section">
        <summary><span>Koordinat dan pengukuran</span><small>Posisi, elevasi, metode ukur</small></summary>
        <div className="site-metadata-grid">
          <label>Latitude
            <input inputMode="decimal" value={value.latitude} onChange={(event) => update("latitude", normalizeCoordinate(event.target.value))} placeholder="-6.2792" />
            <small>Gunakan titik sebagai pemisah desimal.</small>
          </label>
          <label>Longitude
            <input inputMode="decimal" value={value.longitude} onChange={(event) => update("longitude", normalizeCoordinate(event.target.value))} placeholder="106.6503" />
            <small>Gunakan titik sebagai pemisah desimal.</small>
          </label>
          <label>Elevasi (meter)<input inputMode="decimal" value={value.elevationMeters} onChange={(event) => update("elevationMeters", event.target.value.replace(",", "."))} placeholder="32" /></label>
          <label>Metode Ukur
            <select value={value.measurementMethod} onChange={(event) => update("measurementMethod", event.target.value)}>
              <option value="">Pilih metode</option><option>Altimeter di smartphone/smartwatch</option><option>Handheld GPS</option><option>Altimeter Analog</option><option>Topographic Map</option><option>Survey Barometric</option>
            </select>
          </label>
          <label>Tanggal Ukur<input type="date" value={value.measurementDate} onChange={(event) => update("measurementDate", event.target.value)} /></label>
        </div>
      </details>

      <details className="metadata-section">
        <summary><span>Komunikasi dan interval</span><small>Transport data, teknisi, frekuensi</small></summary>
        <div className="site-metadata-grid">
          <label>No SIM/GSM<input inputMode="tel" value={value.simNumber} onChange={(event) => update("simNumber", event.target.value)} placeholder="08112345678" /></label>
          <fieldset className="transport-field wide-field">
            <legend>Metode Transport</legend>
            <div>{TRANSPORT_METHODS.map((method) => <label key={method}><input type="checkbox" checked={value.transportMethods.includes(method)} onChange={() => toggleTransport(method)} />{method}</label>)}</div>
          </fieldset>
          <label>Zona Waktu
            <select value={value.timezone} onChange={(event) => update("timezone", event.target.value)}>
              <option value="">Pilih zona waktu</option><option>WIB (UTC+7)</option><option>WITA (UTC+8)</option><option>WIT (UTC+9)</option>
            </select>
          </label>
          <label>Nama Teknisi<input value={value.technicianName} onChange={(event) => update("technicianName", event.target.value)} /></label>
          <label>No HP Teknisi<input inputMode="tel" value={value.technicianPhone} onChange={(event) => update("technicianPhone", event.target.value)} placeholder="085712345678" /></label>
          <label>Instansi Teknisi<input value={value.technicianAgency} onChange={(event) => update("technicianAgency", event.target.value)} placeholder="Contoh: Telkomsel" /></label>
          <label>Mulai Interval<input type="date" value={value.intervalStart} onChange={(event) => update("intervalStart", event.target.value)} /></label>
          <label>Akhir Interval<input type="date" value={value.intervalEnd} onChange={(event) => update("intervalEnd", event.target.value)} /></label>
          <label>Interval Data (menit)
            <select value={value.dataInterval} onChange={(event) => update("dataInterval", event.target.value)}>
              <option value="">Pilih interval</option><option value="1">1 Menit</option><option value="2">2 Menit</option><option value="5">5 Menit</option><option value="10">10 Menit</option><option value="60">60 Menit</option><option>Lainnya</option>
            </select>
          </label>
          {value.dataInterval === "Lainnya" && <label>Interval Lainnya (menit)<input type="number" min="1" value={value.dataIntervalOther} onChange={(event) => update("dataIntervalOther", event.target.value)} /></label>}
        </div>
      </details>

      <div className="metadata-actions">
        <span>Metadata tersimpan otomatis untuk site ini</span>
        <button className="danger-button" onClick={onReset}>Kosongkan metadata</button>
      </div>
    </section>
  );
}
