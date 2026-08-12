"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CONDITION_OPTIONS, MOUNTING_MATERIALS } from "./config/form-options";
import rawData from "./data.generated.json";
import { loadLocalDraft, saveLocalDraft } from "./lib/draft-storage";
import { getTabSessionId, OPERATOR_STORAGE_KEY, type DraftPayload } from "./lib/server-draft";
import { logoutCurrentBrowser } from "./lib/local-logout";
import { getSupabaseBrowserClient } from "./lib/supabase/client";
import { useServerDraft } from "./hooks/useServerDraft";
import { useProductCatalog } from "./hooks/useProductCatalog";
import { buildAloptamaFilename, downloadText } from "./lib/download";
import { buildInventoryCsv, buildInventoryJson } from "./lib/inventory-export";
import { normalizeProductText, resolveInstalledProduct, suggestProducts } from "./lib/product-qc";
import {
  createUnitDetail,
  getItemUnits,
  isMountingCategory,
  makeId,
  normalizeSearch,
} from "./lib/inventory";
import {
  EMPTY_SITE_METADATA,
  resolveFieldDomain,
} from "./lib/site-metadata";
import { AWOS_KAT3_SITE_TYPE, getAllowedSiteSubtypes, getAwosKat3Family } from "./lib/site-subtypes";
import SiteMetadataForm from "./SiteMetadataForm";
import type {
  Condition,
  DataSet,
  DraftContexts,
  Drafts,
  InstalledItem,
  Inventory,
  Product,
  SiteMetadataDrafts,
  SourceMode,
  UnitDetail,
} from "./types/inventory";
import type { SiteMetadata } from "./types/site-metadata";
import type { StationAccount } from "./lib/auth";

const data = rawData as DataSet;

export default function InventoryApp({
  account,
  adminSubmissionId,
  adminMode = false,
  startInEditMode = false,
  initialSite = "",
  initialSubtype = "",
}: {
  account: StationAccount;
  adminSubmissionId?: string;
  adminMode?: boolean;
  startInEditMode?: boolean;
  initialSite?: string;
  initialSubtype?: string;
}) {
  const router = useRouter();
  const stations = useMemo(
    () => Array.from(new Set(data.stationSites.map((row) => row.station))).sort((a, b) => a.localeCompare(b, "id")),
    [],
  );
  const mode = "site" as SourceMode;
  const station = account.stationName;
  const [site, setSite] = useState(initialSite);
  const [subtype, setSubtype] = useState(initialSubtype);
  const templateProfile = "";
  const [categoryQuery, setCategoryQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [customMaterial, setCustomMaterial] = useState("");
  const [customBrand, setCustomBrand] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [customProductNote, setCustomProductNote] = useState("");
  const [drafts, setDrafts] = useState<Drafts>({});
  const [draftContexts, setDraftContexts] = useState<DraftContexts>({});
  const [siteMetadataDrafts, setSiteMetadataDrafts] = useState<SiteMetadataDrafts>({});
  const [operatorName, setOperatorName] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [editFeedback, setEditFeedback] = useState("");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const downloadRef = useRef<HTMLDivElement | null>(null);
  const autoEditStartedRef = useRef(false);
  const proposalInFlightRef = useRef(new Set<string>());
  const productCatalog = useProductCatalog(account.stationId);
  const isAdminEditor = adminMode || Boolean(adminSubmissionId);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const parsed = loadLocalDraft();
        if (parsed && !isAdminEditor) {
          if (parsed.station === station) {
            setSite(parsed.site ?? "");
            setSubtype(parsed.subtype ?? "");
          }
          setDrafts(parsed.drafts ?? {});
          setDraftContexts(parsed.draftContexts ?? {});
          setSiteMetadataDrafts(parsed.siteMetadataDrafts ?? {});
        }
        setOperatorName(isAdminEditor ? account.username : localStorage.getItem(OPERATOR_STORAGE_KEY) ?? "");
      } catch {
        // Draf yang rusak diabaikan agar aplikasi tetap dapat digunakan.
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [account.username, isAdminEditor, station]);

  useEffect(() => {
    if (!isAdminEditor) return;
    setSite(initialSite);
    setSubtype(initialSubtype);
    autoEditStartedRef.current = false;
    setEditFeedback("");
  }, [adminSubmissionId, initialSite, initialSubtype, isAdminEditor]);

  useEffect(() => {
    if (!hydrated || isAdminEditor) return;
    saveLocalDraft({ mode, station, site, subtype, templateProfile, drafts, draftContexts, siteMetadataDrafts });
  }, [mode, station, site, subtype, templateProfile, drafts, draftContexts, siteMetadataDrafts, hydrated, isAdminEditor]);

  useEffect(() => {
    if (hydrated && !isAdminEditor) localStorage.setItem(OPERATOR_STORAGE_KEY, operatorName);
  }, [hydrated, isAdminEditor, operatorName]);

  useEffect(() => {
    if (!activeCategory) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveCategory(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [activeCategory]);

  useEffect(() => {
    if (!downloadOpen) return;
    const closeWithKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDownloadOpen(false);
    };
    const closeWithClick = (event: MouseEvent) => {
      if (downloadRef.current && !downloadRef.current.contains(event.target as Node)) setDownloadOpen(false);
    };
    window.addEventListener("keydown", closeWithKey);
    window.addEventListener("mousedown", closeWithClick);
    return () => {
      window.removeEventListener("keydown", closeWithKey);
      window.removeEventListener("mousedown", closeWithClick);
    };
  }, [downloadOpen]);

  const sites = useMemo(
    () => data.stationSites.filter((row) => row.stationId === account.stationId),
    [account.stationId],
  );
  const selectedSite = sites.find((row) => row.site === site);
  const allSubtypeOptions = useMemo(
    () => data.siteSubtypes.filter((row) => row.siteType === selectedSite?.siteType),
    [selectedSite],
  );
  const kat3Family = selectedSite?.siteType === AWOS_KAT3_SITE_TYPE
    ? getAwosKat3Family(selectedSite.site)
    : null;
  const subtypeOptions = selectedSite ? getAllowedSiteSubtypes({
    siteName: selectedSite.site,
    siteTypeName: selectedSite.siteType,
    siteSubtypes: allSubtypeOptions,
    getSubtypeName: (row) => row.subtype,
  }) : [];
  const subtypes = subtypeOptions.map((row) => row.subtype);

  const currentSubtype = subtypes.length === 1 ? subtypes[0] : subtypes.includes(subtype) ? subtype : "";
  const selectedSubtype = subtypeOptions.find((row) => row.subtype === currentSubtype);
  const profile = mode === "template" ? templateProfile : selectedSubtype?.profile ?? "";
  const categories = data.barangByJenis[profile] ?? [];
  const draftKey = mode === "template"
    ? `template::${profile}`
    : `site::${station}::${site}::${currentSubtype}`;
  const inventory = useMemo(() => drafts[draftKey] ?? {}, [draftKey, drafts]);
  const metadataKey = `site-metadata::${station}::${site}`;
  const siteMetadata = useMemo(() => siteMetadataDrafts[metadataKey] ?? EMPTY_SITE_METADATA, [metadataKey, siteMetadataDrafts]);
  const automaticMetadata = {
    stationName: station,
    siteName: site,
    equipmentType: selectedSite?.siteType ?? "",
    fieldDomain: resolveFieldDomain(selectedSite?.siteType ?? ""),
    uptManager: station,
  };
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
  const hasLocalDraft = Boolean(
    Object.values(inventory).some((items) => items.length > 0)
    || runwayAzimuth
    || Object.values(siteMetadata).some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value)),
  );

  const visibleProducts = useMemo(() => {
    const query = normalizeSearch(productQuery);
    return productCatalog.products
      .filter((product) => !query || normalizeSearch(`${product.brand} ${product.model}`).includes(query))
      .slice(0, 60);
  }, [productCatalog.products, productQuery]);

  const similarProducts = useMemo(
    () => suggestProducts(customBrand, customModel, productCatalog.products, productCatalog.aliases),
    [customBrand, customModel, productCatalog.aliases, productCatalog.products],
  );

  function setInventory(next: Inventory) {
    setDrafts((current) => ({ ...current, [draftKey]: next }));
  }

  function addProduct(product: Product, proposal?: { id?: string; status: InstalledItem["proposalStatus"] }) {
    if (!activeCategory) return;
    const nextItem: InstalledItem = {
      ...product,
      id: makeId(),
      itemKind: proposal ? "custom-product" : "product",
      productProposalId: proposal?.id,
      proposalStatus: proposal?.status,
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

  async function addCustomProduct() {
    if (!activeCategory || !customBrand.trim() || !customModel.trim()) return;
    const brand = customBrand.trim();
    const model = customModel.trim();
    const client = getSupabaseBrowserClient();
    let proposalId: string | undefined;
    if (client && selectedSiteId && selectedSubtypeId) {
      const { data: proposalRows } = await client.rpc("create_product_proposal", {
        p_site_id: selectedSiteId,
        p_site_subtype_id: selectedSubtypeId,
        p_brand: brand,
        p_model: model,
        p_operator_name: operatorName || null,
        p_note: customProductNote.trim() || null,
      });
      const proposal = Array.isArray(proposalRows) ? proposalRows[0] : proposalRows;
      proposalId = proposal?.proposal_id;
    }
    addProduct({ brand, model }, { id: proposalId, status: proposalId ? "PENDING" : "PENDING_LOCAL" });
    setEditFeedback(proposalId
      ? "Usulan produk disimpan dan sedang menunggu pemeriksaan admin."
      : "Produk tersimpan di draf lokal. Usulan akan dicoba kembali saat server tersedia.");
    setCustomBrand("");
    setCustomModel("");
    setCustomProductNote("");
    if (proposalId) void productCatalog.refresh();
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

  function updateSiteMetadata(next: SiteMetadata) {
    setSiteMetadataDrafts((current) => ({ ...current, [metadataKey]: next }));
  }

  function resetSiteMetadata() {
    if (!window.confirm("Kosongkan seluruh metadata Aloptama untuk site ini?")) return;
    setSiteMetadataDrafts((current) => {
      const next = { ...current };
      delete next[metadataKey];
      return next;
    });
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

  const applyRemotePayload = useCallback((next: DraftPayload) => {
    setDrafts((current) => ({ ...current, [draftKey]: next.inventory ?? {} }));
    setDraftContexts((current) => ({ ...current, [draftKey]: { runwayAzimuth: next.runwayAzimuth ?? "" } }));
    setSiteMetadataDrafts((current) => ({ ...current, [metadataKey]: next.siteMetadata ?? EMPTY_SITE_METADATA }));
  }, [draftKey, metadataKey]);

  const selectedSiteId = selectedSite?.siteId ?? "";
  const selectedSubtypeId = selectedSubtype?.subtypeId ?? "";
  const serverPayload: DraftPayload | null = hydrated && selectedSiteId && selectedSubtypeId
    ? {
      schemaVersion: 1,
      stationId: account.stationId,
      siteId: selectedSiteId,
      siteSubtypeId: selectedSubtypeId,
      inventory,
      runwayAzimuth: acceptsRunwayAzimuth ? runwayAzimuth : "",
      siteMetadata,
    }
    : null;

  const draftScope = selectedSiteId && selectedSubtypeId
    ? { stationId: account.stationId, siteId: selectedSiteId, siteSubtypeId: selectedSubtypeId }
    : null;
  const sync = useServerDraft({
    scope: draftScope,
    payload: serverPayload,
    operatorName,
    onRemotePayload: applyRemotePayload,
    adminSubmissionId,
    adminMode: isAdminEditor,
  });

  useEffect(() => {
    if (!startInEditMode || !adminSubmissionId || !hydrated || autoEditStartedRef.current
      || sync.status === "idle" || sync.status === "opening") return;
    autoEditStartedRef.current = true;
    void sync.retryAcquireEdit().then((started) => {
      setEditFeedback(started ? "Mode pengisian Admin aktif." : "Data ini sedang diedit dari perangkat lain.");
    });
  }, [adminSubmissionId, hydrated, startInEditMode, sync]);

  useEffect(() => {
    if (!sync.canEdit || !selectedSiteId || !selectedSubtypeId) return;
    const pendingItems = Object.entries(inventory).flatMap(([category, items]) =>
      items.filter((item) => item.itemKind !== "material" && !item.productId && !item.productProposalId).map((item) => ({ category, item })),
    );
    if (!pendingItems.length) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    void (async () => {
      let created = false;
      for (const { category, item } of pendingItems) {
        if (proposalInFlightRef.current.has(item.id)) continue;
        proposalInFlightRef.current.add(item.id);
        const canonical = productCatalog.products.find((product) =>
          normalizeProductText(product.brand) === normalizeProductText(item.brand)
          && normalizeProductText(product.model) === normalizeProductText(item.model),
        );
        if (canonical?.productId) {
          setDrafts((current) => ({
            ...current,
            [draftKey]: {
              ...(current[draftKey] ?? {}),
              [category]: (current[draftKey]?.[category] ?? []).map((currentItem) => currentItem.id === item.id
                ? { ...currentItem, productId: canonical.productId, itemKind: "product", proposalStatus: undefined }
                : currentItem),
            },
          }));
          continue;
        }
        const { data: proposalRows } = await client.rpc("create_product_proposal", {
          p_site_id: selectedSiteId,
          p_site_subtype_id: selectedSubtypeId,
          p_brand: item.brand,
          p_model: item.model,
          p_operator_name: operatorName || null,
          p_note: "Konversi otomatis dari produk custom pada draf lama/lokal.",
        });
        const proposal = Array.isArray(proposalRows) ? proposalRows[0] : proposalRows;
        if (proposal?.proposal_id) {
          created = true;
          setDrafts((current) => ({
            ...current,
            [draftKey]: {
              ...(current[draftKey] ?? {}),
              [category]: (current[draftKey]?.[category] ?? []).map((currentItem) => currentItem.id === item.id
                ? { ...currentItem, productProposalId: proposal.proposal_id, proposalStatus: "PENDING" }
                : currentItem),
            },
          }));
        } else {
          proposalInFlightRef.current.delete(item.id);
        }
      }
      if (created) void productCatalog.refresh();
    })();
  }, [draftKey, inventory, operatorName, productCatalog, selectedSiteId, selectedSubtypeId, sync.canEdit]);

  function productForDisplay(item: InstalledItem) {
    return resolveInstalledProduct(item, productCatalog.proposalMap);
  }

  function productForExport(item: InstalledItem) {
    if (item.itemKind === "material") return item;
    const resolved = productForDisplay(item);
    return { ...item, brand: resolved.brand, model: resolved.model };
  }

  function persistLocalNow() {
    saveLocalDraft({ mode, station, site, subtype, templateProfile, drafts, draftContexts, siteMetadataDrafts });
  }

  async function startEditing() {
    setEditFeedback("");
    if (isAdminEditor && !adminSubmissionId && selectedSiteId && selectedSubtypeId) {
      const response = await fetch("/api/admin/submissions/ensure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stationId: account.stationId,
          siteId: selectedSiteId,
          siteSubtypeId: selectedSubtypeId,
          sessionId: getTabSessionId(),
          operatorName: operatorName || account.username,
        }),
      });
      const result = await response.json() as { submissionId?: string; error?: string };
      if (!response.ok || !result.submissionId) {
        setEditFeedback(result.error || "Tidak dapat memulai Edit sebagai Admin.");
        return;
      }
      router.replace(`/admin/submissions/${result.submissionId}?edit=1`);
      return;
    }
    if (!isAdminEditor && !operatorName.trim()) {
      setEditFeedback("Isi Nama operator sebelum mulai mengedit.");
      return;
    }
    const started = await sync.retryAcquireEdit();
    setEditFeedback(started ? "Mode pengisian aktif." : "Data ini sedang diedit dari perangkat lain.");
  }

  async function saveManual() {
    persistLocalNow();
    const result = await sync.saveNow();
    if (result === "saved") setEditFeedback("Tersimpan ke server.");
    else if (result === "skipped") setEditFeedback("Semua perubahan sudah tersimpan.");
    else if (result === "local-only") setEditFeedback("Tersimpan di perangkat, tetapi belum tersinkron ke server.");
    else if (result === "conflict") setEditFeedback("Ada versi server yang lebih baru. Muat versi terbaru sebelum lanjut.");
    else setEditFeedback("Tidak bisa menyimpan karena lock tidak aktif.");
  }

  async function finishEditing() {
    persistLocalNow();
    const result = await sync.finishEditing();
    if (result === "finished") setEditFeedback("Selesai mengedit. Lock dilepas.");
    else if (result === "release-pending") setEditFeedback("Data tersimpan, tetapi release lock belum terkonfirmasi. Lock akan kedaluwarsa dalam maksimal 5 menit.");
    else if (result === "local-only") setEditFeedback("Data lokal aman, tetapi server belum tersinkron. Lock belum dilepas.");
    else if (result === "conflict") setEditFeedback("Ada versi server yang lebih baru. Lock belum dilepas.");
    else setEditFeedback("Belum bisa selesai mengedit. Coba simpan lagi.");
  }

  async function saveBeforeDownload() {
    if (!sync.isEditing || !sync.dirty) return true;
    persistLocalNow();
    const result = await sync.saveNow();
    if (result === "local-only") {
      setEditFeedback("Data tersimpan di perangkat, tetapi belum tersinkron ke server. Unduhan tetap memakai data terbaru di browser.");
      return false;
    }
    if (result === "conflict" || result === "read-only") {
      setEditFeedback("Unduhan memakai data terbaru di browser, tetapi server belum tersinkron.");
      return false;
    }
    return true;
  }

  async function logout() {
    const client = getSupabaseBrowserClient();
    if (client) {
      await logoutCurrentBrowser({
        releaseLock: sync.release,
        signOut: (options) => client.auth.signOut(options),
      });
    }
    router.replace("/");
    router.refresh();
  }

  async function exportCurrentDraft() {
    await saveBeforeDownload();
    setDownloadOpen(false);
    if (!serverPayload || !selectedSite) return;
    const payload = buildInventoryJson({
      stationName: station,
      siteName: site,
      siteTypeName: selectedSite.siteType,
      subtypeName: currentSubtype,
      profile,
      categories,
      payload: serverPayload,
      resolveItem: productForExport,
    });
    const filename = buildAloptamaFilename(station, site, currentSubtype, "json");
    downloadText(filename, JSON.stringify(payload, null, 2), "application/json");
  }

  async function exportCurrentDraftCsv() {
    await saveBeforeDownload();
    setDownloadOpen(false);
    if (!serverPayload || !selectedSite) return;
    const csv = buildInventoryCsv({
      stationName: station,
      siteName: site,
      siteTypeName: selectedSite.siteType,
      subtypeName: currentSubtype,
      profile,
      categories,
      payload: serverPayload,
      resolveItem: productForExport,
    });
    const filename = buildAloptamaFilename(station, site, currentSubtype, "csv");
    downloadText(filename, csv, "text/csv;charset=utf-8");
  }

  const locationReady = Boolean(station && site && currentSubtype);
  const syncLabels = {
    idle: "Pilih draf",
    browsing: "Mode lihat",
    opening: "Memuat server",
    editing: "Mode pengisian aktif",
    saved: "Tersimpan di server",
    saving: "Menyimpan",
    "local-only": "Tersimpan lokal",
    "read-only": "Mode baca saja",
    conflict: "Versi server berubah",
  } as const;
  const savedTime = sync.lastSavedAt
    ? new Date(sync.lastSavedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : "";
  const lockActivityTime = sync.lockLastActivityAt
    ? new Date(sync.lockLastActivityAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : "";

  function renderDownloadMenu() {
    return <div className="download-menu" ref={downloadRef}>
      <button
        className="secondary-button"
        disabled={sync.status === "opening"}
        aria-haspopup="menu"
        aria-expanded={downloadOpen}
        onClick={() => setDownloadOpen((open) => !open)}
      >
        Unduh
      </button>
      {downloadOpen && (
        <div className="download-options" role="menu">
          <button role="menuitem" onClick={exportCurrentDraftCsv}>
            <strong>Unduh CSV</strong>
            <span>Data untuk pengumpulan</span>
          </button>
          <button role="menuitem" onClick={exportCurrentDraft}>
            <strong>Unduh JSON</strong>
            <span>Salinan data lengkap</span>
          </button>
        </div>
      )}
    </div>;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">AC</div>
          <div>
            <p className="eyebrow">METEOROLOGI • KLIMATOLOGI • GEOFISIKA</p>
            <h1>Aloptama Collect</h1>
          </div>
        </div>
        <div className="account-actions">
          <div className={`local-badge status-${sync.status}`}><span /> {syncLabels[sync.status]}{sync.status === "saved" && savedTime ? ` ${savedTime}` : ""}</div>
          {isAdminEditor && <button className="logout-button" onClick={() => router.push("/admin")}>Dashboard Admin</button>}
          <Link className="logout-button" href="/panduan">Panduan</Link>
          <button className="logout-button" onClick={logout}>Keluar</button>
        </div>
      </header>

      <section className="intro">
        <div>
          <p className="kicker">INVENTARISASI BARANG TERPASANG</p>
          <h2>Lengkapi Site dan Perangkatnya.</h2>
          <p className="intro-copy">Pilih lokasi, lengkapi metadata Aloptama, tentukan subtipe, lalu catat setiap perangkat. Draf tersimpan otomatis di browser ini.</p>
        </div>
        <div className="dataset-facts" aria-label="Ringkasan data">
          <div><strong>{stations.length}</strong><span>stasiun</span></div>
          <div><strong>{data.stationSites.length}</strong><span>aloptama / site</span></div>
          <div><strong>{productCatalog.products.length}</strong><span>produk</span></div>
        </div>
      </section>

      <div className="workspace">
        <aside className="setup-panel">
          <div className="panel-heading">
            <span className="step-number">1</span>
            <div><p className="eyebrow">LANGKAH PERTAMA</p><h3>Tentukan lokasi</h3></div>
          </div>

          <div className="form-stack account-location">
              <label className="field-label" htmlFor="aloptama-station-display">Stasiun</label>
              <input id="aloptama-station-display" autoComplete="off" value={station} readOnly />

              <label className="field-label" htmlFor="aloptama-entry-operator">Nama operator</label>
              <input id="aloptama-entry-operator" autoComplete="off" value={operatorName} onChange={(event) => setOperatorName(event.target.value)} placeholder="Nama petugas yang mengisi" />

              <label className="field-label" htmlFor="site-select">Aloptama / Site</label>
              <select id="site-select" value={site} disabled={!station || sync.isEditing} onChange={(event) => { setSite(event.target.value); setSubtype(""); setEditFeedback(""); }}>
                <option value="">{station ? "Pilih site" : "Pilih stasiun dahulu"}</option>
                {sites.map((row) => <option key={`${row.site}-${row.siteType}`} value={row.site}>{row.site}</option>)}
              </select>
              {selectedSite && <p className="field-hint">Tipe site: <strong>{selectedSite.siteType}</strong></p>}

              <label className="field-label" htmlFor="subtype-select">Subtipe site</label>
              <select id="subtype-select" value={currentSubtype} disabled={!site || !subtypes.length || sync.isEditing} onChange={(event) => { setSubtype(event.target.value); setEditFeedback(""); }}>
                <option value="">{site ? "Pilih subtipe" : "Pilih site dahulu"}</option>
                {subtypes.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              {kat3Family && <p className="field-hint">Pilihan dibatasi untuk AWOS Kat. 3 <strong>{kat3Family}</strong>.</p>}
              {selectedSite?.siteType === AWOS_KAT3_SITE_TYPE && !kat3Family && <p className="warning-copy">Variant AWOS Kategori III belum terpetakan. Hubungi pengelola master data.</p>}
              {site && !subtypes.length && selectedSite?.siteType !== AWOS_KAT3_SITE_TYPE && <p className="warning-copy">Belum ada subtipe untuk tipe site ini.</p>}

              {acceptsRunwayAzimuth && (
                <>
                  <label className="field-label" htmlFor="runway-azimuth">Azimuth runway</label>
                  <input
                    id="runway-azimuth"
                    autoComplete="off"
                    inputMode="numeric"
                    maxLength={2}
                    disabled={!sync.canEdit}
                    value={runwayAzimuth}
                    onChange={(event) => updateRunwayAzimuth(event.target.value)}
                    placeholder="Contoh: 01, 11, 24"
                  />
                  <p className="field-hint">Khusus subtipe TDZ dan End Point, maksimal dua digit.</p>
                </>
              )}

              {locationReady && (
                <div className="edit-start-block">
                  <button className="primary-button" disabled={sync.isEditing || sync.status === "opening"} onClick={startEditing}>
                    {isAdminEditor ? "Edit sebagai Admin" : hasLocalDraft || sync.hasServerDraft ? "Edit Data" : "Mulai Pengisian"}
                  </button>
                  {!sync.isEditing && renderDownloadMenu()}
                  <span>{sync.isEditing ? "Mode pengisian aktif" : "Mode lihat aktif. Belum ada lock."}</span>
                </div>
              )}
              {editFeedback && <p className="warning-copy">{editFeedback}</p>}
          </div>

          {locationReady && (
            <div className="selection-summary">
              <p className="eyebrow">PROFIL BARANG</p>
              <strong>{profile}</strong>
              <span>{categories.length} kategori perlu diperiksa</span>
            </div>
          )}
        </aside>

        <div className="content-column">
          {locationReady && (sync.status === "read-only" || sync.status === "conflict") && (
            <div className="sync-notice" role="status">
              <div>
                <strong>{sync.status === "conflict" ? "Ada versi server yang lebih baru" : "Draf sedang digunakan sesi lain"}</strong>
                <span>{sync.status === "conflict" ? "Draf lokal tetap disimpan sampai Anda memuat versi terbaru." : `Operator aktif: ${sync.lockOperator || "tidak diketahui"}.${lockActivityTime ? ` Aktivitas terakhir ${lockActivityTime}.` : ""}`}</span>
              </div>
              {sync.status === "conflict" && <button className="secondary-button" onClick={sync.loadLatest}>Muat versi terbaru</button>}
              {(sync.canTakeover || (isAdminEditor && sync.status === "read-only")) && (
                <button className="secondary-button" onClick={() => {
                  if (!isAdminEditor || window.confirm("Ambil alih lock aktif sebagai Super Admin? Perubahan yang belum tersimpan pada editor lain dapat terputus.")) {
                    void sync.takeover();
                  }
                }}>{isAdminEditor ? "Ambil Alih sebagai Admin" : "Ambil alih draf"}</button>
              )}
              {sync.status === "read-only" && <button className="secondary-button" onClick={startEditing}>Coba lagi</button>}
            </div>
          )}
          <fieldset className="editing-surface" disabled={locationReady && !sync.canEdit} onInputCapture={sync.touchActivity} onChangeCapture={sync.touchActivity}>
          {mode === "site" && selectedSite && (
            <SiteMetadataForm
              value={siteMetadata}
              automatic={automaticMetadata}
              onChange={updateSiteMetadata}
              onReset={resetSiteMetadata}
            />
          )}

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
                  <p className="eyebrow">{mode === "site" ? "LANGKAH KETIGA" : "LANGKAH KEDUA"}</p>
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
                  <input autoComplete="off" value={categoryQuery} onChange={(event) => setCategoryQuery(event.target.value)} placeholder="Cari kategori barang…" />
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
                        <button className="add-product" onClick={() => { setActiveCategory(category); setProductQuery(""); setCustomMaterial(""); setCustomBrand(""); setCustomModel(""); setCustomProductNote(""); void productCatalog.refresh(); }}>
                          <span aria-hidden="true">＋</span> {mountingCategory ? "Pilih bahan" : "Pilih produk"}
                        </button>
                      </div>

                      {items.map((item) => {
                        const resolved = productForDisplay(item);
                        return (
                        <div className={`installed-item proposal-${resolved.status?.toLowerCase() ?? "none"}`} key={item.id}>
                          <div className="product-identity">
                            <div><span>{item.itemKind === "material" ? "BM" : resolved.brand.slice(0, 2).toUpperCase()}</span></div>
                            <p>
                              <strong>{item.itemKind === "material" ? "Bahan mounting" : resolved.brand}</strong>
                              <span>{item.itemKind === "material" ? item.material : resolved.model}</span>
                            </p>
                            <button aria-label={`Hapus ${item.itemKind === "material" ? item.material : `${item.brand} ${item.model}`}`} onClick={() => removeItem(category, item.id)}>Hapus</button>
                          </div>
                          {resolved.status === "PENDING" && <p className="proposal-message">Produk ini sedang menunggu pemeriksaan admin.</p>}
                          {resolved.status === "PENDING_LOCAL" && <p className="proposal-message">Usulan masih tersimpan lokal dan akan dikirim saat server tersedia.</p>}
                          {(resolved.status === "APPROVED" || resolved.status === "MERGED") && (resolved.brand !== item.brand || resolved.model !== item.model) && (
                            <p className="proposal-message is-resolved">Produk telah disesuaikan admin dari {item.brand} - {item.model}.</p>
                          )}
                          {resolved.status === "REJECTED" && <p className="proposal-message is-rejected">Usulan produk ditolak. Silakan pilih produk lain atau perbaiki usulan.{resolved.reviewNote ? ` Catatan: ${resolved.reviewNote}` : ""}</p>}
                          <label className="quantity-field">Jumlah
                            <input autoComplete="off" type="number" min="1" value={item.quantity} onChange={(event) => updateItemQuantity(category, item, Number(event.target.value))} />
                          </label>
                          <div className="unit-list">
                            {getItemUnits(item).map((unit, unitIndex) => (
                              <section className="unit-detail" key={unit.id}>
                                <strong>Unit {unitIndex + 1}</strong>
                                <div className="metadata-grid">
                                  {item.itemKind !== "material" && <label>Nomor seri<input autoComplete="off" value={unit.serialNumber} onChange={(event) => updateUnit(category, item, unit.id, { serialNumber: event.target.value })} placeholder="Opsional" /></label>}
                                  <label>Kondisi
                                    <select value={unit.condition} onChange={(event) => updateUnit(category, item, unit.id, { condition: event.target.value as Condition })}>
                                      {CONDITION_OPTIONS.map((condition) => <option key={condition}>{condition}</option>)}
                                    </select>
                                  </label>
                                  <label>Tahun pasang<input autoComplete="off" inputMode="numeric" maxLength={4} value={unit.installedYear} onChange={(event) => updateUnit(category, item, unit.id, { installedYear: event.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="YYYY" /></label>
                                  <label className="notes-field">Catatan<input autoComplete="off" value={unit.notes} onChange={(event) => updateUnit(category, item, unit.id, { notes: event.target.value })} placeholder="Keterangan tambahan" /></label>
                                </div>
                              </section>
                            ))}
                          </div>
                        </div>
                        );
                      })}
                    </article>
                  );
                })}
                {!filteredCategories.length && <p className="no-results">Kategori tidak ditemukan.</p>}
              </div>

              <div className="bottom-actions">
                <button className="danger-button" onClick={resetCurrentDraft}>Kosongkan draf</button>
                <div className="save-actions">
                  <span>
                    {sync.isEditing
                      ? sync.dirty
                        ? sync.status === "saving" ? "Menyimpan..." : "Ada perubahan belum tersinkron"
                        : savedTime ? `Tersimpan otomatis ${savedTime}` : "Semua perubahan sudah tersimpan"
                      : "Mode lihat. Klik Edit Data untuk mengubah."}
                  </span>
                  <div className="export-actions">
                    {sync.isEditing && <button className="secondary-button" onClick={saveManual}>Simpan</button>}
                    {sync.isEditing && renderDownloadMenu()}
                    {sync.isEditing && <button className="primary-button" onClick={finishEditing}>Selesai Mengedit</button>}
                  </div>
                </div>
              </div>
            </>
          )}
          </section>
          </fieldset>
        </div>
      </div>

      {activeCategory && sync.canEdit && (
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
                    <input id="custom-material" autoComplete="off" autoFocus value={customMaterial} onChange={(event) => setCustomMaterial(event.target.value)} placeholder="Contoh: baja ringan" onKeyDown={(event) => { if (event.key === "Enter") addMaterial(customMaterial); }} />
                    <button disabled={!customMaterial.trim()} onClick={() => addMaterial(customMaterial)}>Tambahkan</button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <label className="product-search">
                  <span aria-hidden="true">⌕</span>
                  <input autoComplete="off" autoFocus value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Cari merek atau tipe produk…" />
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
                  <p><strong>Produk tidak ditemukan?</strong><span>Usulkan produk baru untuk diperiksa admin.</span></p>
                  {similarProducts.length > 0 && (
                    <div className="similar-products">
                      <strong>Apakah yang Anda maksud salah satu produk berikut?</strong>
                      {similarProducts.map((product) => (
                        <button key={product.productId ?? `${product.brand}:${product.model}`} onClick={() => addProduct(product)}>
                          {product.brand} — {product.model}
                        </button>
                      ))}
                    </div>
                  )}
                  <div>
                    <label>Brand<input autoComplete="off" value={customBrand} onChange={(event) => setCustomBrand(event.target.value)} placeholder="Nama brand" /></label>
                    <label>Tipe<input autoComplete="off" value={customModel} onChange={(event) => setCustomModel(event.target.value)} placeholder="Tipe / model produk" /></label>
                    <label>Catatan<input autoComplete="off" value={customProductNote} onChange={(event) => setCustomProductNote(event.target.value)} placeholder="Opsional" /></label>
                    <button disabled={!customBrand.trim() || !customModel.trim()} onClick={() => void addCustomProduct()}>Usulkan produk baru</button>
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
