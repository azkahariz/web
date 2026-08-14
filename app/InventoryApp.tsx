"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppFeedback } from "./components/AppFeedback";
import { getConditionOptions, MOUNTING_MATERIALS } from "./config/form-options";
import rawData from "./data.generated.json";
import { loadLocalDraft, saveLocalDraft } from "./lib/draft-storage";
import { getTabSessionId, OPERATOR_STORAGE_KEY, type DraftPayload } from "./lib/server-draft";
import { logoutCurrentBrowser } from "./lib/local-logout";
import { getSupabaseBrowserClient } from "./lib/supabase/client";
import { useServerDraft } from "./hooks/useServerDraft";
import { useStationSiteProgress } from "./hooks/useStationSiteProgress";
import { useProductCatalog } from "./hooks/useProductCatalog";
import { buildAloptamaFilename, downloadText } from "./lib/download";
import { buildInventoryCsv, buildInventoryJson } from "./lib/inventory-export";
import { normalizeProductText, resolveInstalledProduct, suggestProducts } from "./lib/product-qc";
import {
  getItemFunctionCategories,
  inventoryCategoryEntries,
  inventoryCategoryIsFilled,
  inventoryCategoryNames,
  itemIdByName,
  physicalUnitCount,
  recordedCategoryCount,
  removeInventoryCategory,
  sensorFunctionGroup,
  withItemFunctionCategories,
} from "./lib/category-functions";
import {
  createUnitDetail,
  getItemUnits,
  isMountingCategory,
  makeId,
  normalizeWarehouseConditions,
  normalizeSearch,
} from "./lib/inventory";
import {
  EMPTY_SITE_METADATA,
  resolveFieldDomain,
} from "./lib/site-metadata";
import { AWOS_KAT3_SITE_TYPE, getAllowedSiteSubtypes, getAwosKat3Family } from "./lib/site-subtypes";
import { isWarehouseContext } from "./lib/warehouse";
import SiteMetadataForm from "./SiteMetadataForm";
import StationSiteProgressPanel from "./components/StationSiteProgressPanel";
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
const EMPTY_CATEGORIES: string[] = [];

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
  const feedback = useAppFeedback();
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
  const [warehouseCategoryPickerOpen, setWarehouseCategoryPickerOpen] = useState(false);
  const [warehouseCategoryQuery, setWarehouseCategoryQuery] = useState("");
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
    if (!warehouseCategoryPickerOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWarehouseCategoryPickerOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [warehouseCategoryPickerOpen]);

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
  const profileCategories = data.barangByJenis[profile] ?? EMPTY_CATEGORIES;
  const warehouseMode = isWarehouseContext(data, selectedSite, selectedSubtype);
  const conditionOptions = getConditionOptions(warehouseMode);
  const draftKey = mode === "template"
    ? `template::${profile}`
    : `site::${station}::${site}::${currentSubtype}`;
  const inventory = useMemo(() => drafts[draftKey] ?? {}, [draftKey, drafts]);
  const categoryIds = useMemo(() => itemIdByName(data.master), []);
  const warehouseCategories = useMemo(() => {
    const allowed = new Set(profileCategories);
    return inventoryCategoryNames(inventory).filter((category) => allowed.has(category));
  }, [inventory, profileCategories]);
  const categories = warehouseMode ? warehouseCategories : profileCategories;
  const metadataKey = `site-metadata::${station}::${site}`;
  const siteMetadata = useMemo(() => ({ ...EMPTY_SITE_METADATA, ...(siteMetadataDrafts[metadataKey] ?? {}) }), [metadataKey, siteMetadataDrafts]);
  const automaticMetadata = {
    stationName: station,
    siteName: site,
    equipmentType: selectedSite?.siteType ?? "",
    fieldDomain: resolveFieldDomain(selectedSite?.siteType ?? ""),
    uptManager: station,
  };
  const runwayAzimuth = draftContexts[draftKey]?.runwayAzimuth ?? "";
  const acceptsRunwayAzimuth = /(?:TDZ|End Point)$/i.test(currentSubtype);
  const filledCount = profileCategories.filter((category) => inventoryCategoryIsFilled(inventory, category)).length;
  const totalUnits = physicalUnitCount(inventory);
  const warehouseRecordedCategories = recordedCategoryCount(inventory);
  const progress = profileCategories.length ? Math.round((filledCount / profileCategories.length) * 100) : 0;
  const filteredCategories = categories.filter((category) =>
    normalizeSearch(category).includes(normalizeSearch(categoryQuery)),
  );
  const hasLocalDraft = Boolean(
    Object.values(inventory).some((items) => items.length > 0)
    || runwayAzimuth
    || (!warehouseMode && Object.values(siteMetadata).some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value))),
  );

  const availableWarehouseCategories = profileCategories.filter((category) => (
    !warehouseCategories.includes(category)
    && normalizeSearch(category).includes(normalizeSearch(warehouseCategoryQuery))
  ));

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

  function addWarehouseCategory(category: string) {
    if (!warehouseMode || !profileCategories.includes(category) || category in inventory) return;
    setInventory({ ...inventory, [category]: [] });
    setWarehouseCategoryPickerOpen(false);
    setWarehouseCategoryQuery("");
  }

  function addProduct(product: Product, proposal?: { id?: string; status: InstalledItem["proposalStatus"] }) {
    if (!activeCategory) return;
    const nextItem = withItemFunctionCategories({
      ...product,
      id: makeId(),
      itemKind: proposal ? "custom-product" : "product",
      productProposalId: proposal?.id,
      proposalStatus: proposal?.status,
      quantity: 1,
      units: [createUnitDetail()],
    }, [activeCategory], categoryIds);
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
    const nextItem = withItemFunctionCategories({
      brand: "",
      model: "",
      id: makeId(),
      itemKind: "material",
      material: material.trim(),
      quantity: 1,
      units: [createUnitDetail()],
    }, [activeCategory], categoryIds);
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

  function updateItemFunctions(storageCategory: string, item: InstalledItem, categories: string[]) {
    if (!categories.length) return;
    const nextItem = withItemFunctionCategories(item, categories, categoryIds);
    const destination = categories.includes(storageCategory) ? storageCategory : categories[0];
    const next: Inventory = { ...inventory };
    next[storageCategory] = (inventory[storageCategory] ?? []).filter((row) => row.id !== item.id);
    next[destination] = [...(destination === storageCategory ? next[destination] : inventory[destination] ?? []), nextItem];
    if (warehouseMode) {
      for (const category of categories) if (!(category in next)) next[category] = [];
    }
    setInventory(next);
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

  async function resetSiteMetadata() {
    if (!await feedback.confirm({
      title: "Kosongkan metadata Aloptama?",
      description: "Seluruh metadata untuk site ini akan dikosongkan dari draf saat ini.",
      confirmLabel: "Kosongkan",
      danger: true,
    })) return;
    setSiteMetadataDrafts((current) => {
      const next = { ...current };
      delete next[metadataKey];
      return next;
    });
  }

  async function removeItem(category: string, item: InstalledItem) {
    const functions = getItemFunctionCategories(item, category);
    if (functions.length > 1 && !await feedback.confirm({
      title: "Hapus unit sensor kombinasi?",
      description: `Produk ini akan dihapus dari fungsi ${functions.join(" dan ")}.`,
      confirmLabel: "Hapus Unit",
      danger: true,
    })) return;
    setInventory({
      ...inventory,
      [category]: (inventory[category] ?? []).filter((row) => row.id !== item.id),
    });
  }

  async function removeWarehouseCategory(category: string) {
    const affected = inventoryCategoryEntries(inventory, category);
    if (affected.length && !await feedback.confirm({
      title: `Hapus kategori ${category}?`,
      description: `${affected.reduce((sum, row) => sum + getItemUnits(row.item).length, 0)} unit terkait akan dihapus dari kategori ini. Unit kombinasi tetap dipertahankan pada fungsi lainnya.`,
      confirmLabel: "Hapus Kategori",
      danger: true,
    })) return;
    setInventory(removeInventoryCategory(inventory, category, categoryIds));
  }

  async function resetCurrentDraft() {
    if (!profileCategories.length || !await feedback.confirm({
      title: "Kosongkan seluruh pilihan barang?",
      description: "Seluruh pilihan barang pada lokasi ini akan dihapus dari draf.",
      confirmLabel: "Kosongkan Draf",
      danger: true,
    })) return;
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
    setSiteMetadataDrafts((current) => ({ ...current, [metadataKey]: { ...EMPTY_SITE_METADATA, ...(next.siteMetadata ?? {}) } }));
  }, [draftKey, metadataKey]);

  const selectedSiteId = selectedSite?.siteId ?? "";
  const selectedSubtypeId = selectedSubtype?.subtypeId ?? "";
  const serverPayload: DraftPayload | null = hydrated && selectedSiteId && selectedSubtypeId
    ? {
      schemaVersion: 1,
      stationId: account.stationId,
      siteId: selectedSiteId,
      siteSubtypeId: selectedSubtypeId,
      inventory: warehouseMode ? normalizeWarehouseConditions(inventory) : inventory,
      runwayAzimuth: acceptsRunwayAzimuth ? runwayAzimuth : "",
      siteMetadata: warehouseMode ? EMPTY_SITE_METADATA : siteMetadata,
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
  const {
    rows: stationSiteProgressRows,
    loading: stationSiteProgressLoading,
    errorMessage: stationSiteProgressError,
    refresh: refreshStationSiteProgress,
  } = useStationSiteProgress(!isAdminEditor);

  useEffect(() => {
    if (isAdminEditor || sync.status !== "saved" || !sync.lastSavedAt) return;
    void refreshStationSiteProgress();
  }, [isAdminEditor, refreshStationSiteProgress, sync.lastSavedAt, sync.status]);

  const hasLocalInventory = Object.values(inventory).some((items) => items.length > 0);
  const effectiveStationSiteProgressRows = isAdminEditor || !selectedSiteId || !selectedSubtypeId || (!sync.isEditing && !hasLocalInventory)
    ? stationSiteProgressRows
    : [
      ...stationSiteProgressRows.filter((row) => row.siteId !== selectedSiteId || row.siteSubtypeId !== selectedSubtypeId),
      warehouseMode
        ? {
          siteId: selectedSiteId,
          siteSubtypeId: selectedSubtypeId,
          filledCount: 0,
          totalCount: 0,
          progressKind: "WAREHOUSE" as const,
          warehouseCategoryCount: recordedCategoryCount(inventory),
          warehouseUnitCount: physicalUnitCount(inventory),
        }
        : {
          siteId: selectedSiteId,
          siteSubtypeId: selectedSubtypeId,
          filledCount: profileCategories.filter((category) => inventoryCategoryIsFilled(inventory, category)).length,
          totalCount: profileCategories.length,
          progressKind: "EXPECTED" as const,
          warehouseCategoryCount: 0,
          warehouseUnitCount: 0,
        },
    ];

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
      warehouseMode,
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
      warehouseMode,
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
          <p className="kicker">{warehouseMode ? "INVENTARISASI BARANG GUDANG" : "INVENTARISASI BARANG TERPASANG"}</p>
          <h2>{warehouseMode ? "Catat Barang di Gudang." : "Lengkapi Site dan Perangkatnya."}</h2>
          <p className="intro-copy">{warehouseMode
            ? "Pilih kategori yang tersedia di Gudang, lalu catat produk dan setiap unit fisiknya."
            : "Pilih lokasi, lengkapi metadata Aloptama, tentukan subtipe, lalu catat setiap perangkat."} Draf tersimpan otomatis di browser ini.</p>
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
              <span>{warehouseMode
                ? `${profileCategories.length} kategori tersedia · ${categories.length} dipilih`
                : `${profileCategories.length} kategori perlu diperiksa`}</span>
            </div>
          )}
          {!isAdminEditor && (
            <StationSiteProgressPanel
              data={data}
              sites={sites}
              submissions={effectiveStationSiteProgressRows}
              loading={stationSiteProgressLoading}
              error={stationSiteProgressError}
              selectedSite={site}
              disabled={sync.isEditing}
              onSelectSite={(nextSite) => {
                setSite(nextSite);
                setSubtype("");
                setEditFeedback("");
              }}
            />
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
                <button className="secondary-button" onClick={async () => {
                  if (!isAdminEditor || await feedback.confirm({
                    title: "Ambil alih lock aktif?",
                    description: "Perubahan yang belum tersimpan pada editor lain dapat terputus.",
                    confirmLabel: "Ambil Alih",
                    danger: true,
                  })) void sync.takeover();
                }}>{isAdminEditor ? "Ambil Alih sebagai Admin" : "Ambil alih draf"}</button>
              )}
              {sync.status === "read-only" && <button className="secondary-button" onClick={startEditing}>Coba lagi</button>}
            </div>
          )}
          <fieldset className="editing-surface" disabled={locationReady && !sync.canEdit} onInputCapture={sync.touchActivity} onChangeCapture={sync.touchActivity}>
          {mode === "site" && selectedSite && !warehouseMode && (
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
          ) : !profile || !profileCategories.length ? (
            <div className="empty-state warning-state">
              <span className="empty-index">!</span>
              <div><h3>Profil barang belum tersedia</h3><p>Subtipe ini belum mempunyai pasangan <em>Jenis</em> pada sheet Barang.</p></div>
            </div>
          ) : (
            <>
              <div className="inventory-head">
                <div>
                  <p className="eyebrow">{mode === "site" ? "LANGKAH KETIGA" : "LANGKAH KEDUA"}</p>
                  <h3>{warehouseMode ? "Barang di Gudang" : "Pilih barang terpasang"}</h3>
                  <p>{mode === "site" ? site : `Pratinjau ${profile}`}</p>
                </div>
                {warehouseMode ? <div className="warehouse-summary">
                  <strong>{totalUnits} unit fisik</strong>
                  <span>{warehouseRecordedCategories} kategori tercatat</span>
                </div> : <div className="progress-block">
                  <div><span>{filledCount} dari {profileCategories.length} kategori</span><strong>{progress}%</strong></div>
                  <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
                </div>}
              </div>

              <div className="inventory-tools">
                {warehouseMode ? <button className="primary-button warehouse-add-category" type="button" onClick={() => setWarehouseCategoryPickerOpen(true)}>+ Tambah Kategori Barang</button> : <label className="category-search">
                  <span aria-hidden="true">⌕</span>
                  <input autoComplete="off" value={categoryQuery} onChange={(event) => setCategoryQuery(event.target.value)} placeholder="Cari kategori barang…" />
                </label>}
                <span>{totalUnits} unit dipilih</span>
              </div>

              {warehouseMode && !categories.length && <div className="empty-state warehouse-empty-state">
                <span className="empty-index">01</span>
                <div><h3>Gudang belum mempunyai kategori</h3><p>Tambahkan hanya kategori barang yang benar-benar tersedia di Gudang ini.</p></div>
              </div>}

              <div className="category-list">
                {filteredCategories.map((category) => {
                  const entries = inventoryCategoryEntries(inventory, category);
                  const unitCount = entries.reduce((sum, entry) => sum + getItemUnits(entry.item).length, 0);
                  const mountingCategory = isMountingCategory(category);
                  return (
                    <article className={`category-card ${entries.length ? "is-filled" : ""}`} key={category}>
                      <div className="category-title-row">
                        <span className="category-number">{String(categories.indexOf(category) + 1).padStart(2, "0")}</span>
                        <div className="category-name"><h4>{category}</h4><p>{entries.length ? `${unitCount} ${mountingCategory ? "bahan mounting" : "unit fisik"}` : mountingCategory ? "Belum memilih bahan" : "Belum memilih produk"}</p></div>
                        {warehouseMode && <button className="remove-category" type="button" aria-label={`Hapus kategori ${category}`} onClick={() => void removeWarehouseCategory(category)}>Hapus kategori</button>}
                        <button className="add-product" onClick={() => { setActiveCategory(category); setProductQuery(""); setCustomMaterial(""); setCustomBrand(""); setCustomModel(""); setCustomProductNote(""); void productCatalog.refresh(); }}>
                          <span aria-hidden="true">＋</span> {mountingCategory ? "Pilih bahan" : "Pilih produk"}
                        </button>
                      </div>

                      {entries.map(({ storageCategory, item }) => {
                        const resolved = productForDisplay(item);
                        const functionGroup = sensorFunctionGroup(category);
                        const functions = getItemFunctionCategories(item, storageCategory);
                        const functionValue = functionGroup
                          ? functionGroup.categories.filter((name) => functions.includes(name)).join("|")
                          : "";
                        return (
                        <div className={`installed-item proposal-${resolved.status?.toLowerCase() ?? "none"}`} key={item.id}>
                          <div className="product-identity">
                            <div><span>{item.itemKind === "material" ? "BM" : resolved.brand.slice(0, 2).toUpperCase()}</span></div>
                            <p>
                              <strong>{item.itemKind === "material" ? "Bahan mounting" : resolved.brand}</strong>
                              <span>{item.itemKind === "material" ? item.material : resolved.model}</span>
                            </p>
                            <button aria-label={`Hapus ${item.itemKind === "material" ? item.material : `${item.brand} ${item.model}`}`} onClick={() => void removeItem(storageCategory, item)}>Hapus</button>
                          </div>
                          {resolved.status === "PENDING" && <p className="proposal-message">Produk ini sedang menunggu pemeriksaan admin.</p>}
                          {resolved.status === "PENDING_LOCAL" && <p className="proposal-message">Usulan masih tersimpan lokal dan akan dikirim saat server tersedia.</p>}
                          {(resolved.status === "APPROVED" || resolved.status === "MERGED") && (resolved.brand !== item.brand || resolved.model !== item.model) && (
                            <p className="proposal-message is-resolved">Produk telah disesuaikan admin dari {item.brand} - {item.model}.</p>
                          )}
                          {resolved.status === "REJECTED" && <p className="proposal-message is-rejected">Usulan produk ditolak. Silakan pilih produk lain atau perbaiki usulan.{resolved.reviewNote ? ` Catatan: ${resolved.reviewNote}` : ""}</p>}
                          {functionGroup && item.itemKind !== "material" && <label className="function-field">Fungsi sensor
                            <select value={functionValue} onChange={(event) => updateItemFunctions(storageCategory, item, event.target.value.split("|").filter(Boolean))}>
                              <option value={functionGroup.categories[0]}>{functionGroup.labels[0]}</option>
                              <option value={functionGroup.categories[1]}>{functionGroup.labels[1]}</option>
                              <option value={functionGroup.categories.join("|")}>{functionGroup.labels[2]}</option>
                            </select>
                            {functions.length > 1 && <small>Satu unit fisik memenuhi dua kategori.</small>}
                          </label>}
                          <label className="quantity-field">Jumlah
                            <input autoComplete="off" type="number" min="1" value={item.quantity} onChange={(event) => updateItemQuantity(storageCategory, item, Number(event.target.value))} />
                          </label>
                          <div className="unit-list">
                            {getItemUnits(item).map((unit, unitIndex) => (
                              <section className="unit-detail" key={unit.id}>
                                <strong>Unit {unitIndex + 1}</strong>
                                <div className="metadata-grid">
                                  {item.itemKind !== "material" && <label>Nomor seri<input autoComplete="off" value={unit.serialNumber} onChange={(event) => updateUnit(storageCategory, item, unit.id, { serialNumber: event.target.value })} placeholder="Opsional" /></label>}
                                  <label>Kondisi
                                    {warehouseMode ? <input value="Baik" readOnly aria-label="Kondisi" /> : <select value={unit.condition} onChange={(event) => updateUnit(storageCategory, item, unit.id, { condition: event.target.value as Condition })}>
                                      {conditionOptions.map((condition) => <option key={condition}>{condition}</option>)}
                                      {!conditionOptions.some((condition) => condition === unit.condition) && unit.condition && <option>{unit.condition}</option>}
                                    </select>}
                                  </label>
                                  {warehouseMode ? <>
                                    <label>Tahun pengadaan<input autoComplete="off" inputMode="numeric" maxLength={4} value={unit.procurementYear ?? ""} onChange={(event) => updateUnit(storageCategory, item, unit.id, { procurementYear: event.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="YYYY" /></label>
                                    <label className="wide-unit-field">Nama kegiatan pengadaan<input autoComplete="off" value={unit.procurementActivity ?? ""} onChange={(event) => updateUnit(storageCategory, item, unit.id, { procurementActivity: event.target.value })} placeholder="Contoh: Pengadaan Aloptama MKG 2025" /></label>
                                  </> : <label>Tahun pasang<input autoComplete="off" inputMode="numeric" maxLength={4} value={unit.installedYear} onChange={(event) => updateUnit(storageCategory, item, unit.id, { installedYear: event.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="YYYY" /></label>}
                                  <label className="notes-field">Catatan<input autoComplete="off" value={unit.notes} onChange={(event) => updateUnit(storageCategory, item, unit.id, { notes: event.target.value })} placeholder="Keterangan tambahan" /></label>
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

      {warehouseCategoryPickerOpen && warehouseMode && sync.canEdit && (
        <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setWarehouseCategoryPickerOpen(false); }}>
          <section className="product-drawer category-picker-drawer" role="dialog" aria-modal="true" aria-labelledby="warehouse-category-dialog-title">
            <div className="drawer-head">
              <div><p className="eyebrow">KATALOG PROFIL BARANG GUDANG</p><h3 id="warehouse-category-dialog-title">Tambah Kategori Barang</h3></div>
              <button aria-label="Tutup pemilih kategori" onClick={() => setWarehouseCategoryPickerOpen(false)}>×</button>
            </div>
            <label className="product-search">
              <span aria-hidden="true">⌕</span>
              <input autoComplete="off" autoFocus value={warehouseCategoryQuery} onChange={(event) => setWarehouseCategoryQuery(event.target.value)} placeholder="Cari kategori barang…" />
            </label>
            <p className="search-caption">Kategori yang sudah dipilih tidak ditampilkan lagi.</p>
            <div className="product-results warehouse-category-results">
              {availableWarehouseCategories.map((category) => <button key={category} onClick={() => addWarehouseCategory(category)}>
                <span className="product-avatar">KB</span>
                <span><strong>{category}</strong><small>Kategori Barang</small></span>
                <span className="choose-label">Tambah</span>
              </button>)}
              {!availableWarehouseCategories.length && <div className="no-product"><strong>Kategori tidak ditemukan</strong><span>Coba kata pencarian lain atau semua kategori sudah dipilih.</span></div>}
            </div>
          </section>
        </div>
      )}

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
