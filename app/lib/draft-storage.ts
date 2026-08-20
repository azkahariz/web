import type {
  DraftContexts,
  Drafts,
  SiteMetadataDrafts,
  SourceMode,
} from "../types/inventory";

export const DRAFT_STORAGE_KEY = "irm-collect-local-drafts-v1";

export type LocalDraftState = {
  version?: 2;
  mode?: SourceMode;
  stationId?: string;
  siteId?: string;
  subtypeId?: string;
  station?: string;
  site?: string;
  subtype?: string;
  templateProfile?: string;
  drafts?: Drafts;
  draftContexts?: DraftContexts;
  siteMetadataDrafts?: SiteMetadataDrafts;
};

export function loadLocalDraft(): LocalDraftState | null {
  const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
  return saved ? JSON.parse(saved) as LocalDraftState : null;
}

export function saveLocalDraft(state: LocalDraftState) {
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(state));
}
