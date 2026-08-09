import type { Inventory } from "../types/inventory";
import type { SiteMetadata } from "../types/site-metadata";

export const STATION_DRAFT_STORAGE_KEY = "aloptama-collect-station-drafts-v1";
export const OPERATOR_STORAGE_KEY = "aloptama-collect-operator-name-v1";
export const TAB_SESSION_STORAGE_KEY = "aloptama-collect-tab-session-v1";

export type DraftPayload = {
  schemaVersion: 1;
  stationId: string;
  siteId: string;
  siteSubtypeId: string;
  inventory: Inventory;
  runwayAzimuth: string;
  siteMetadata: SiteMetadata;
};

export type ScopedLocalDraft = {
  payload: DraftPayload;
  serverVersion: number;
  updatedAt: string;
};

type ScopedLocalDrafts = Record<string, ScopedLocalDraft>;

export function scopedDraftKey(stationId: string, siteId: string, siteSubtypeId: string) {
  return `${stationId}::${siteId}::${siteSubtypeId}`;
}

export function readScopedLocalDraft(key: string): ScopedLocalDraft | null {
  try {
    const saved = localStorage.getItem(STATION_DRAFT_STORAGE_KEY);
    const drafts = saved ? JSON.parse(saved) as ScopedLocalDrafts : {};
    return drafts[key] ?? null;
  } catch {
    return null;
  }
}

export function writeScopedLocalDraft(key: string, draft: ScopedLocalDraft) {
  let drafts: ScopedLocalDrafts = {};
  try {
    const saved = localStorage.getItem(STATION_DRAFT_STORAGE_KEY);
    drafts = saved ? JSON.parse(saved) as ScopedLocalDrafts : {};
  } catch {
    // Timpa kontainer rusak, tetapi jangan hapus draf lama yang masih valid.
  }
  localStorage.setItem(STATION_DRAFT_STORAGE_KEY, JSON.stringify({ ...drafts, [key]: draft }));
}

export function getTabSessionId() {
  const existing = sessionStorage.getItem(TAB_SESSION_STORAGE_KEY);
  if (existing) return existing;
  const value = crypto.randomUUID();
  sessionStorage.setItem(TAB_SESSION_STORAGE_KEY, value);
  return value;
}

export function payloadFingerprint(payload: DraftPayload) {
  return JSON.stringify(payload);
}

export function chooseInitialDraft(local: ScopedLocalDraft | null, serverPayload: DraftPayload | null, serverVersion: number) {
  if (!local) return { kind: "server" as const, payload: serverPayload };
  if (!serverPayload || serverVersion === 0) return { kind: "local" as const, payload: local.payload };
  if (local.serverVersion === serverVersion) return { kind: "local" as const, payload: local.payload };
  if (payloadFingerprint(local.payload) === payloadFingerprint(serverPayload)) {
    return { kind: "server" as const, payload: serverPayload };
  }
  return { kind: "conflict" as const, payload: serverPayload, localPayload: local.payload };
}

