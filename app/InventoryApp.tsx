"use client";

import { useEffect, useMemo, useState } from "react";
import rawData from "./data.generated.json";

type StationSite = { station: string; site: string; siteType: string };
type SiteSubtype = { siteType: string; subtype: string; profile: string };
type Product = { brand: string; model: string };
type DataSet = {
  stationSites: StationSite[];
  siteSubtypes: SiteSubtype[];
  barangByJenis: Record<string, string[]>;
  products: Product[];
};

type Condition = "Baik" | "Rusak ringan" | "Rusak" | "Tidak beroperasi";

type UnitDetail = {
  id: string;
  serialNumber: string;
  condition: Condition;
  installedYear: string;
  notes: string;
};

type InstalledItem = Product & {
  id: string;
  itemKind?: "product" | "custom-product" | "material";
  material?: string;
  quantity: number;
  units?: UnitDetail[];
  // Kolom lama dipertahankan agar draf browser versi sebelumnya tetap terbaca.
  serialNumber?: string;
  condition?: Condition;
  installedYear?: string;
  notes?: string;
};

type Inventory = Record<string, InstalledItem[]>;
type Drafts = Record<string, Inventory>;
type DraftContexts = Record<string, { runwayAzimuth?: string }>;
type SourceMode = "site" | "template";

const data = rawData as DataSet;
const STORAGE_KEY = "irm-collect-local-drafts-v1";
const MOUNTING_MATERIALS = [
  "Besi galvanis",
  "Stainless steel",
  "Aluminium",
  "Besi",
  "PVC",
  "Fiberglass",
];

function isMountingCategory(category: string | null): boolean {
  return Boolean(category && /^mounting\b/i.test(category));
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function normalizeSearch(value: string) {
  return value.toLocaleLowerCase("id-ID").trim();
}

function createUnitDetail(): UnitDetail {
  return {
    id: makeId(),
    serialNumber: "",
    condition: "Baik",
    installedYear: "",
    notes: "",
  };
}

function getItemUnits(item: InstalledItem): UnitDetail[] {
  if (item.units?.length) return item.units;
  return Array.from({ length: Math.max(1, item.quantity || 1) }, (_, index) => ({
    id: `${item.id}-unit-${index + 1}`,
    serialNumber: index === 0 ? item.serialNumber ?? "" : "",
    condition: index === 0 ? item.condition ?? "Baik" : "Baik",
    installedYear: index === 0 ? item.installedYear ?? "" : "",
    notes: index === 0 ? item.notes ?? "" : "",
  }));
}

function inferKat3Family(siteName: string, options: SiteSubtype[]): string {
  const normalizedSite = normalizeSearch(siteName).replace(/[^a-z0-9]/g, "");
  const families = options.flatMap((option) => {
    const match = option.subtype.match(/^AWOS Kategori III (.+?) (?:TDZ|Mid|End Point|Station)$/i);
    return match ? [match[1]] : [];
  });
  return families.find((family) => normalizedSite.includes(normalizeSearch(family).replace(/[^a-z0-9]/g, ""))) ?? "";
}

function csvCell(value: string | number | null | undefined) {
  const normalized = String(value ?? "").replace(/\r?\n/g, " ");
  return `"${normalized.replace(/"/g, '""')}"`;
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function InventoryApp() {
  const stations = useMemo(
    () => Array.from(new Set(data.stationSites.map((row) => row.station))).sort((a, b) => a.localeCompare(b, "id")),
    [],
  );
  const profiles = useMemo(() => Object.keys(data.barangByJenis), []);

  const [mode, setMode] = useState<SourceMode>("site");
  const [station, setStation] = useState("");
  const [stationQuery, setStationQuery] = useState("");
  const [stationPickerOpen, setStationPickerOpen] = useState(false);
  const [site, setSite] = useState("");
  const [subtype, setSubtype] = useState("");
  const [templateProfile, setTemplateProfile] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [customMaterial, setCustomMaterial] = useState("");
  const [customBrand, setCustomBrand] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [drafts, setDrafts] = useState<Drafts>({});
  const [draftContexts, setDraftContexts] = useState<DraftContexts>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as {
            mode?: SourceMode;
            station?: string;
            site?: string;
            subtype?: string;
            templateProfile?: string;
            drafts?: Drafts;
            draftContexts?: DraftContexts;
          };
          setMode(parsed.mode ?? "site");
          setStation(parsed.station ?? "");
          setStationQuery(parsed.station ?? "");
          setSite(parsed.site ?? "");
          setSubtype(parsed.subtype ?? "");
          setTemplateProfile(parsed.templateProfile ?? "");
          setDrafts(parsed.drafts ?? {});
          setDraftContexts(parsed.draftContexts ?? {});
        }
      } catch {
        // Draf yang rusak diabaikan agar aplikasi tetap dapat digunakan.
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ mode, station, site, subtype, templateProfile, drafts, draftContexts }),
    );
  }, [mode, station, site, subtype, templateProfile, drafts, draftContexts, hydrated]);

  useEffect(() => {
    if (!activeCategory) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveCategory(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [activeCategory]);

  const stationSuggestions = useMemo(() => {
    const query = normalizeSearch(stationQuery);
    return stations.filter((name) => !query || normalizeSearch(name).includes(query));
  }, [stationQuery, stations]);

  const sites = useMemo(
    () => data.stationSites.filter((row) => row.station === station),
    [station],
  );
  const selectedSite = sites.find((row) => row.site === site);
  const allSubtypeOptions = useMemo(
    () => data.siteSubtypes.filter((row) => row.siteType === selectedSite?.siteType),
    [selectedSite],
  );
  const kat3Family = selectedSite?.siteType === "AWOS Kategori III"
    ? inferKat3Family(selectedSite.site, allSubtypeOptions)
    : "";
  const subtypeOptions = kat3Family
    ? allSubtypeOptions.filter((row) => row.subtype.includes(` ${kat3Family} `))
    : allSubtypeOptions;
  const subtypes = subtypeOptions.map((row) => row.subtype);

  const currentSubtype = subtypes.length === 1 ? subtypes[0] : subtypes.includes(subtype) ? subtype : "";
  const selectedSubtype = subtypeOptions.find((row) => row.subtype === currentSubtype);
  const profile = mode === "template" ? templateProfile : selectedSubtype?.profile ?? "";
  const categories = data.barangByJenis[profile] ?? [];
  const draftKey = mode === "template"
    ? `template::${profile}`
    : `site::${station}::${site}::${currentSubtype}`;
  const inventory = drafts[draftKey] ?? {};
  const runwayAzimuth = draftContexts[draftKey]?.runwayAzimuth ?? "";
  const acceptsRunwayAzimuth = /(?:TDZ|End Point)$/i.test(currentSubtype);
  const filledCount = categories.filter((category) => (inventory[category]?.length ?? 0) > 0).length;
  const totalUnits = categories.reduce(
    (sum, category) => sum + (inventory[category] ?? []).reduce((itemSum, item) => itemSum + Math.max(1, item.quantity || 1), 0),
    0,
  );
  const progress = categories.length ? Math.round((filledCount / categories.length) * 100) : 0;
  const filteredCategories = categories.filter((category) =>
    normalizeSearch(category).includes(normalizeSearch(categoryQuery)),
  );

  const visibleProducts = useMemo(() => {
    const query = normalizeSearch(productQuery);
    return data.products
      .filter((product) => !query || normalizeSearch(`${product.brand} ${product.model}`).includes(query))
      .slice(0, 60);
  }, [productQuery]);

  function selectStation(name: string) {
    setStation(name);
    setStationQuery(name);
    setSite("");
    setSubtype("");
    setStationPickerOpen(false);
  }

  function setInventory(next: Inventory) {
    setDrafts((current) => ({ ...current, [draftKey]: next }));
  }

  function addProduct(product: Product) {
    if (!activeCategory) return;
    const nextItem: InstalledItem = {
      ...product,
      id: makeId(),
      itemKind: "product",
      quantity: 1,
      units: [createUnitDetail()],
    };
    setInventory({
      ...inventory,
      [activeCategory]: [...(inventory[activeCategory] ?? []), nextItem],
    });
    setActiveCategory(null);
    setProductQuery("");
  }

  function addCustomProduct() {
    if (!activeCategory || !customBrand.trim() || !customModel.trim()) return;
    addProduct({ brand: customBrand.trim(), model: customModel.trim() });
    setCustomBrand("");
    setCustomModel("");
  }

  function addMaterial(material: string) {
    if (!activeCategory || !material.trim()) return;
    const nextItem: InstalledItem = {
      brand: "",
      model: "",
      id: makeId(),
      itemKind: "material",
      material: material.trim(),
      quantity: 1,
      units: [createUnitDetail()],
    };
    setInventory({
      ...inventory,
      [activeCategory]: [...(inventory[activeCategory] ?? []), nextItem],
    });
    setActiveCategory(null);
    setCustomMaterial("");
  }

  function updateItem(category: string, id: string, patch: Partial<InstalledItem>) {
    setInventory({
      ...inventory,
      [category]: (inventory[category] ?? []).map((item) => item.id === id ? { ...item, ...patch } : item),
    });
  }

  function updateItemQuantity(category: string, item: InstalledItem, nextQuantity: number) {
    const quantity = Math.max(1, nextQuantity || 1);
    const currentUnits = getItemUnits(item);
    const units = quantity > currentUnits.length
      ? [...currentUnits, ...Array.from({ length: quantity - currentUnits.length }, createUnitDetail)]
      : currentUnits.slice(0, quantity);
    updateItem(category, item.id, { quantity, units });
  }

  function updateUnit(category: string, item: InstalledItem, unitId: string, patch: Partial<UnitDetail>) {
    const units = getItemUnits(item).map((unit) => unit.id === unitId ? { ...unit, ...patch } : unit);
    updateItem(category, item.id, { units });
  }

  function updateRunwayAzimuth(value: string) {
    setDraftContexts((current) => ({
      ...current,
      [draftKey]: { ...current[draftKey], runwayAzimuth: value.replace(/\D/g, "").slice(0, 2) },
    }));
  }

  function removeItem(category: string, id: string) {
    setInventory({
      ...inventory,
      [category]: (inventory[category] ?? []).filter((item) => item.id !== id),
    });
  }

  function resetCurrentDraft() {
    if (!categories.length || !window.confirm("Hapus seluruh pilihan barang pada lokasi ini?")) return;
    setDrafts((current) => {
      const next = { ...current };
      delete next[draftKey];
      return next;
    });
    setDraftContexts((current) => {
      const next = { ...current };
      delete next[draftKey];
      return next;
    });
  }

  function exportCurrentDraft() {
    const payload = {
      exportedAt: new Date().toISOString(),
      source: mode,
      station: mode === "site" ? station : null,
      site: mode === "site" ? site : null,
      siteType: mode === "site" ? selectedSite?.siteType : null,
      subtype: mode === "site" ? currentSubtype : null,
      runwayAzimuth: mode === "site" && acceptsRunwayAzimuth ? runwayAzimuth : null,
      profile,
      items: categories.map((category) => ({ category, products: inventory[category] ?? [] })),
    };
    const filename = `inventaris-${profile.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "draft"}.json`;
    downloadText(filename, JSON.stringify(payload, null, 2), "application/json");
  }

  function exportCurrentDraftCsv() {
    const headers = [
      "Stasiun", "Site", "Tipe Site", "Subtipe Site", "Azimuth Runway", "Profil Barang",
      "Kategori Barang", "Bahan Mounting", "Merk", "Tipe Produk", "Unit Ke", "Nomor Seri", "Jumlah",
      "Kondisi", "Tahun Pasang", "Catatan",
    ];
    const rows = categories.flatMap((category) => {
      const items = inventory[category] ?? [];
      const itemUnits = items.length
        ? items.flatMap((item) => getItemUnits(item).map((unit, index) => ({ item, unit, unitNumber: index + 1 })))
        : [{ item: null, unit: null, unitNumber: null }];
      return itemUnits.map(({ item, unit, unitNumber }) => [
        mode === "site" ? station : "",
        mode === "site" ? site : "",
        mode === "site" ? selectedSite?.siteType ?? "" : "",
        mode === "site" ? currentSubtype : "",
        mode === "site" && acceptsRunwayAzimuth ? runwayAzimuth : "",
        profile,
        category,
        item?.itemKind === "material" ? item.material ?? "" : "",
        item?.itemKind === "material" ? "" : item?.brand ?? "",
        item?.itemKind === "material" ? "" : item?.model ?? "",
        unitNumber ?? "",
        item?.itemKind === "material" ? "" : unit?.serialNumber ?? "",
        unit ? 1 : "",
        unit?.condition ?? "",
        unit?.installedYear ?? "",
        unit?.notes ?? "",
      ]);
    });
    const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const filename = `inventaris-${profile.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "draft"}.csv`;
    downloadText(filename, csv, "text/csv;charset=utf-8");
  }

  const locationReady = mode === "template" ? Boolean(templateProfile) : Boolean(station && site && currentSubtype);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">IR</div>
          <div>
            <p className="eyebrow">PENDATAAN LOKAL</p>
            <h1>IRM Collect</h1>
          </div>
        </div>
        <div className="local-badge"><span /> Tersimpan di perangkat</div>
      </header>

      <section className="intro">
        <div>
          <p className="kicker">INVENTARISASI BARANG TERPASANG</p>
          <h2>Catat Perangkat di Setiap Site.</h2>
          <p className="intro-copy">Pilih lokasi, tentukan subtipe, lalu cari produk berdasarkan merek atau tipe. Draf tersimpan otomatis di browser ini.</p>
        </div>
        <div className="dataset-facts" aria-label="Ringkasan data">
          <div><strong>{stations.length}</strong><span>stasiun</span></div>
          <div><strong>{data.stationSites.length}</strong><span>aloptama / site</span></div>
          <div><strong>{data.products.length}</strong><span>produk</span></div>
        </div>
      </section>

      <div className="workspace">
        <aside className="setup-panel">
          <div className="panel-heading">
            <span className="step-number">1</span>
            <div><p className="eyebrow">LANGKAH PERTAMA</p><h3>Tentukan lokasi</h3></div>
          </div>

          <div className="mode-switch" role="group" aria-label="Mode pemilihan data">
            <button className={mode === "site" ? "active" : ""} onClick={() => setMode("site")}>Berdasarkan site</button>
            <button className={mode === "template" ? "active" : ""} onClick={() => setMode("template")}>Coba jenis langsung</button>
          </div>

          {mode === "site" ? (
            <div className="form-stack">
              <label className="field-label" htmlFor="station-search">Stasiun</label>
              <div className="combobox-wrap">
                <input
                  id="station-search"
                  value={stationQuery}
                  placeholder="Cari nama stasiun…"
                  autoComplete="off"
                  onFocus={() => setStationPickerOpen(true)}
                  onChange={(event) => {
                    setStationQuery(event.target.value);
                    if (event.target.value !== station) {
                      setStation(""); setSite(""); setSubtype("");
                    }
                    setStationPickerOpen(true);
                  }}
                />
                {stationPickerOpen && (
                  <div className="suggestions" role="listbox">
                    <p className="suggestion-count">{stationSuggestions.length} stasiun ditemukan</p>
                    {stationSuggestions.map((name) => (
                      <button key={name} role="option" aria-selected={name === station} onMouseDown={() => selectStation(name)}>{name}</button>
                    ))}
                    {!stationSuggestions.length && <p>Tidak ada stasiun yang cocok.</p>}
                  </div>
                )}
              </div>

              <label className="field-label" htmlFor="site-select">Aloptama / Site</label>
              <select id="site-select" value={site} disabled={!station} onChange={(event) => { setSite(event.target.value); setSubtype(""); }}>
                <option value="">{station ? "Pilih site" : "Pilih stasiun dahulu"}</option>
                {sites.map((row) => <option key={`${row.site}-${row.siteType}`} value={row.site}>{row.site}</option>)}
              </select>
              {selectedSite && <p className="field-hint">Tipe site: <strong>{selectedSite.siteType}</strong></p>}

              <label className="field-label" htmlFor="subtype-select">Subtipe site</label>
              <select id="subtype-select" value={currentSubtype} disabled={!site || !subtypes.length} onChange={(event) => setSubtype(event.target.value)}>
                <option value="">{site ? "Pilih subtipe" : "Pilih site dahulu"}</option>
                {subtypes.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              {kat3Family && <p className="field-hint">Pilihan dibatasi untuk AWOS Kat. 3 <strong>{kat3Family}</strong>.</p>}
              {site && !subtypes.length && <p className="warning-copy">Belum ada subtipe untuk tipe site ini.</p>}

              {acceptsRunwayAzimuth && (
                <>
                  <label className="field-label" htmlFor="runway-azimuth">Azimuth runway</label>
                  <input
                    id="runway-azimuth"
                    inputMode="numeric"
                    maxLength={2}
                    value={runwayAzimuth}
                    onChange={(event) => updateRunwayAzimuth(event.target.value)}
                    placeholder="Contoh: 01, 11, 24"
                  />
                  <p className="field-hint">Khusus subtipe TDZ dan End Point, maksimal dua digit.</p>
                </>
              )}
            </div>
          ) : (
            <div className="form-stack">
              <label className="field-label" htmlFor="profile-select">Jenis pada sheet Barang</label>
              <select id="profile-select" value={templateProfile} onChange={(event) => setTemplateProfile(event.target.value)}>
                <option value="">Pilih jenis</option>
                {profiles.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              <p className="field-hint">Mode ini berguna untuk mencoba Water Level atau jenis lain yang belum mempunyai site.</p>
            </div>
          )}

          {locationReady && (
            <div className="selection-summary">
              <p className="eyebrow">PROFIL BARANG</p>
              <strong>{profile}</strong>
              <span>{categories.length} kategori perlu diperiksa</span>
            </div>
          )}
        </aside>

        <section className="inventory-panel">
          {!locationReady ? (
            <div className="empty-state">
              <span className="empty-index">01</span>
              <div><h3>Mulai dari lokasi</h3><p>Lengkapi pilihan di sebelah kiri. Daftar barang yang sesuai akan muncul otomatis di sini.</p></div>
            </div>
          ) : !profile || !categories.length ? (
            <div className="empty-state warning-state">
              <span className="empty-index">!</span>
              <div><h3>Profil barang belum tersedia</h3><p>Subtipe ini belum mempunyai pasangan <em>Jenis</em> pada sheet Barang.</p></div>
            </div>
          ) : (
            <>
              <div className="inventory-head">
                <div>
                  <p className="eyebrow">LANGKAH KEDUA</p>
                  <h3>Pilih barang terpasang</h3>
                  <p>{mode === "site" ? site : `Pratinjau ${profile}`}</p>
                </div>
                <div className="progress-block">
                  <div><span>{filledCount} dari {categories.length} kategori</span><strong>{progress}%</strong></div>
                  <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
                </div>
              </div>

              <div className="inventory-tools">
                <label className="category-search">
                  <span aria-hidden="true">⌕</span>
                  <input value={categoryQuery} onChange={(event) => setCategoryQuery(event.target.value)} placeholder="Cari kategori barang…" />
                </label>
                <span>{totalUnits} unit dipilih</span>
              </div>

              <div className="category-list">
                {filteredCategories.map((category) => {
                  const items = inventory[category] ?? [];
                  const mountingCategory = isMountingCategory(category);
                  return (
                    <article className={`category-card ${items.length ? "is-filled" : ""}`} key={category}>
                      <div className="category-title-row">
                        <span className="category-number">{String(categories.indexOf(category) + 1).padStart(2, "0")}</span>
                        <div className="category-name"><h4>{category}</h4><p>{items.length ? `${items.length} ${mountingCategory ? "bahan mounting" : "produk terpasang"}` : mountingCategory ? "Belum memilih bahan" : "Belum memilih produk"}</p></div>
                        <button className="add-product" onClick={() => { setActiveCategory(category); setProductQuery(""); setCustomMaterial(""); setCustomBrand(""); setCustomModel(""); }}>
                          <span aria-hidden="true">＋</span> {mountingCategory ? "Pilih bahan" : "Pilih produk"}
                        </button>
                      </div>

                      {items.map((item) => (
                        <div className="installed-item" key={item.id}>
                          <div className="product-identity">
                            <div><span>{item.itemKind === "material" ? "BM" : item.brand.slice(0, 2).toUpperCase()}</span></div>
                            <p>
                              <strong>{item.itemKind === "material" ? "Bahan mounting" : item.brand}</strong>
                              <span>{item.itemKind === "material" ? item.material : item.model}</span>
                            </p>
                            <button aria-label={`Hapus ${item.itemKind === "material" ? item.material : `${item.brand} ${item.model}`}`} onClick={() => removeItem(category, item.id)}>Hapus</button>
                          </div>
                          <label className="quantity-field">Jumlah
                            <input type="number" min="1" value={item.quantity} onChange={(event) => updateItemQuantity(category, item, Number(event.target.value))} />
                          </label>
                          <div className="unit-list">
                            {getItemUnits(item).map((unit, unitIndex) => (
                              <section className="unit-detail" key={unit.id}>
                                <strong>Unit {unitIndex + 1}</strong>
                                <div className="metadata-grid">
                                  {item.itemKind !== "material" && <label>Nomor seri<input value={unit.serialNumber} onChange={(event) => updateUnit(category, item, unit.id, { serialNumber: event.target.value })} placeholder="Opsional" /></label>}
                                  <label>Kondisi<select value={unit.condition} onChange={(event) => updateUnit(category, item, unit.id, { condition: event.target.value as Condition })}><option>Baik</option><option>Rusak ringan</option><option>Rusak</option><option>Tidak beroperasi</option></select></label>
                                  <label>Tahun pasang<input inputMode="numeric" maxLength={4} value={unit.installedYear} onChange={(event) => updateUnit(category, item, unit.id, { installedYear: event.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="YYYY" /></label>
                                  <label className="notes-field">Catatan<input value={unit.notes} onChange={(event) => updateUnit(category, item, unit.id, { notes: event.target.value })} placeholder="Keterangan tambahan" /></label>
                                </div>
                              </section>
                            ))}
                          </div>
                        </div>
                      ))}
                    </article>
                  );
                })}
                {!filteredCategories.length && <p className="no-results">Kategori tidak ditemukan.</p>}
              </div>

              <div className="bottom-actions">
                <button className="danger-button" onClick={resetCurrentDraft}>Kosongkan draf</button>
                <div className="save-actions">
                  <span>Perubahan tersimpan otomatis</span>
                  <div className="export-actions">
                    <button className="secondary-button" onClick={exportCurrentDraft}>Unduh hasil JSON</button>
                    <button className="primary-button" onClick={exportCurrentDraftCsv}>Unduh hasil CSV</button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {activeCategory && (
        <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveCategory(null); }}>
          <section className="product-drawer" role="dialog" aria-modal="true" aria-labelledby="product-dialog-title">
            <div className="drawer-head">
              <div><p className="eyebrow">{isMountingCategory(activeCategory) ? "PILIH BAHAN UNTUK" : "PILIH PRODUK UNTUK"}</p><h3 id="product-dialog-title">{activeCategory}</h3></div>
              <button aria-label="Tutup pencarian produk" onClick={() => setActiveCategory(null)}>×</button>
            </div>
            {isMountingCategory(activeCategory) ? (
              <>
                <p className="search-caption material-caption">Pilih bahan utama mounting. Jika tidak ada di daftar, tulis bahan lain.</p>
                <div className="product-results material-results">
                  {MOUNTING_MATERIALS.map((material) => (
                    <button key={material} onClick={() => addMaterial(material)}>
                      <span className="product-avatar">BM</span>
                      <span><strong>{material}</strong><small>Bahan mounting</small></span>
                      <span className="choose-label">Pilih</span>
                    </button>
                  ))}
                </div>
                <div className="custom-material">
                  <label htmlFor="custom-material">Bahan lainnya</label>
                  <div>
                    <input id="custom-material" autoFocus value={customMaterial} onChange={(event) => setCustomMaterial(event.target.value)} placeholder="Contoh: baja ringan" onKeyDown={(event) => { if (event.key === "Enter") addMaterial(customMaterial); }} />
                    <button disabled={!customMaterial.trim()} onClick={() => addMaterial(customMaterial)}>Tambahkan</button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <label className="product-search">
                  <span aria-hidden="true">⌕</span>
                  <input autoFocus value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Cari merek atau tipe produk…" />
                </label>
                <p className="search-caption">Mencari pada seluruh kolom <strong>Merk</strong> dan <strong>Tipe</strong> · menampilkan maksimal 60 hasil</p>
                <div className="product-results">
                  {visibleProducts.map((product) => (
                    <button key={`${product.brand}::${product.model}`} onClick={() => addProduct(product)}>
                      <span className="product-avatar">{product.brand.slice(0, 2).toUpperCase()}</span>
                      <span><strong>{product.brand}</strong><small>{product.model}</small></span>
                      <span className="choose-label">Pilih</span>
                    </button>
                  ))}
                  {!visibleProducts.length && <div className="no-product"><strong>Produk tidak ditemukan</strong><span>Coba kata lain dari merek atau tipe produk.</span></div>}
                </div>
                <div className="custom-product">
                  <p><strong>Produk tidak ada di daftar?</strong><span>Tambahkan dengan template standar.</span></p>
                  <div>
                    <label>Brand<input value={customBrand} onChange={(event) => setCustomBrand(event.target.value)} placeholder="Nama brand" /></label>
                    <label>Tipe<input value={customModel} onChange={(event) => setCustomModel(event.target.value)} placeholder="Tipe / model produk" onKeyDown={(event) => { if (event.key === "Enter") addCustomProduct(); }} /></label>
                    <button disabled={!customBrand.trim() || !customModel.trim()} onClick={addCustomProduct}>Tambahkan produk</button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
