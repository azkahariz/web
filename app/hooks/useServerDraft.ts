"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/client";
import {
  chooseInitialDraft,
  getTabSessionId,
  payloadFingerprint,
  readScopedLocalDraft,
  scopedDraftKey,
  writeScopedLocalDraft,
  type DraftPayload,
} from "../lib/server-draft";

type Scope = { stationId: string; siteId: string; siteSubtypeId: string };
type RpcState = {
  payload: DraftPayload | Record<string, never>;
  version: number;
  can_edit?: boolean;
  can_takeover?: boolean;
  lock_operator_name?: string | null;
  lock_last_activity_at?: string | null;
  last_saved_at?: string | null;
};
type SaveResult = "saved" | "skipped" | "local-only" | "conflict" | "read-only";
const INVALID_SUBTYPE_MESSAGE = "Subtipe tidak sesuai dengan konfigurasi Site saat ini. Muat ulang data Site dan pilih Subtipe yang tersedia.";

function siteSubtypeError(error: { code?: string; message?: string } | null) {
  return error?.code === "22023" && error.message?.includes("site_subtype_not_allowed")
    ? INVALID_SUBTYPE_MESSAGE
    : "";
}

export type DraftSyncState =
  | "idle"
  | "browsing"
  | "opening"
  | "editing"
  | "saved"
  | "saving"
  | "local-only"
  | "read-only"
  | "conflict";

function firstRow<T>(value: T[] | T | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function useServerDraft({
  scope,
  payload,
  operatorName,
  onRemotePayload,
  adminSubmissionId,
  adminMode = false,
}: {
  scope: Scope | null;
  payload: DraftPayload | null;
  operatorName: string;
  onRemotePayload: (payload: DraftPayload) => void;
  adminSubmissionId?: string;
  adminMode?: boolean;
}) {
  const [status, setStatus] = useState<DraftSyncState>("idle");
  const [isEditing, setIsEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [canTakeover, setCanTakeover] = useState(false);
  const [hasServerDraft, setHasServerDraft] = useState(false);
  const [lockOperator, setLockOperator] = useState("");
  const [lockLastActivityAt, setLockLastActivityAt] = useState<string | null>(null);
  const [latestPayload, setLatestPayload] = useState<DraftPayload | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [openError, setOpenError] = useState("");
  const [retryTick, setRetryTick] = useState(0);
  const versionRef = useRef(0);
  const initializedKeyRef = useRef("");
  const lastSavedFingerprintRef = useRef("");
  const lastTouchRef = useRef(0);
  const generationRef = useRef(0);
  const maxWaitStartedRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  const stationId = scope?.stationId ?? "";
  const siteId = scope?.siteId ?? "";
  const siteSubtypeId = scope?.siteSubtypeId ?? "";
  const serializedPayload = payload ? payloadFingerprint(payload) : "";
  const payloadReady = Boolean(serializedPayload);
  const canEdit = isEditing && !latestPayload;

  useEffect(() => {
    setDirty(Boolean(isEditing && serializedPayload && serializedPayload !== lastSavedFingerprintRef.current));
  }, [isEditing, serializedPayload]);

  useEffect(() => {
    const retry = () => setRetryTick((value) => value + 1);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);

  const release = useCallback(async (target = scope) => {
    if (!target || !initializedKeyRef.current) return false;
    const client = getSupabaseBrowserClient();
    if (!client) return false;
    const { data, error } = adminSubmissionId
      ? await client.rpc("admin_release_submission_lock", {
        p_submission_id: adminSubmissionId,
        p_session_id: getTabSessionId(),
      })
      : await client.rpc("release_submission_lock", {
        p_site_id: target.siteId,
        p_site_subtype_id: target.siteSubtypeId,
        p_session_id: getTabSessionId(),
      });
    if (error || !data) return false;
    setIsEditing(false);
    setDirty(false);
    setStatus("browsing");
    return true;
  }, [adminSubmissionId, scope]);

  const saveNow = useCallback(async (): Promise<SaveResult> => {
    if (!scope || !payload || !serializedPayload || !initializedKeyRef.current) return "skipped";
    const key = scopedDraftKey(scope.stationId, scope.siteId, scope.siteSubtypeId);
    if (key !== initializedKeyRef.current) return "skipped";

    writeScopedLocalDraft(key, { payload, serverVersion: versionRef.current, updatedAt: new Date().toISOString() });
    if (!isEditing || latestPayload) return "read-only";
    if (serializedPayload === lastSavedFingerprintRef.current) return "skipped";
    if (saveInFlightRef.current) return "skipped";

    const client = getSupabaseBrowserClient();
    if (!client) {
      setStatus("local-only");
      return "local-only";
    }

    saveInFlightRef.current = true;
    setStatus("saving");
    try {
      const { data, error } = adminSubmissionId
        ? await client.rpc("admin_save_submission", {
          p_submission_id: adminSubmissionId,
          p_session_id: getTabSessionId(),
          p_expected_version: versionRef.current,
          p_payload: payload,
          p_operator_name: operatorName || "Super Admin",
        })
        : await client.rpc("save_submission", {
          p_site_id: scope.siteId,
          p_site_subtype_id: scope.siteSubtypeId,
          p_session_id: getTabSessionId(),
          p_expected_version: versionRef.current,
          p_payload: payload,
          p_operator_name: operatorName || null,
        });
      if (error) {
        setStatus("local-only");
        return "local-only";
      }

      const row = firstRow(data as Array<{ status: string; version: number; last_saved_at: string | null }>);
      if (!row) return "local-only";
      if (row.status === "saved") {
        versionRef.current = row.version;
        lastSavedFingerprintRef.current = serializedPayload;
        setDirty(false);
        setLastSavedAt(row.last_saved_at);
        writeScopedLocalDraft(key, { payload, serverVersion: row.version, updatedAt: new Date().toISOString() });
        setStatus("saved");
        return "saved";
      }
      if (row.status === "version_conflict") {
        const latest = adminSubmissionId
          ? await client.rpc("admin_get_submission_state", { p_submission_id: adminSubmissionId })
          : await client.rpc("get_submission_state", { p_site_id: scope.siteId, p_site_subtype_id: scope.siteSubtypeId });
        const latestRow = firstRow(latest.data as RpcState[]);
        if (latestRow?.payload && "schemaVersion" in latestRow.payload) setLatestPayload(latestRow.payload as DraftPayload);
        versionRef.current = row.version;
        setStatus("conflict");
        return "conflict";
      }
      setIsEditing(false);
      setDirty(false);
      setStatus("read-only");
      return "read-only";
    } finally {
      saveInFlightRef.current = false;
    }
  }, [adminSubmissionId, isEditing, latestPayload, operatorName, payload, scope, serializedPayload]);

  useEffect(() => {
    const generation = ++generationRef.current;
    initializedKeyRef.current = "";
    maxWaitStartedRef.current = null;
    queueMicrotask(() => {
      if (generation !== generationRef.current) return;
      setIsEditing(false);
      setCanTakeover(false);
      setHasServerDraft(false);
      setLatestPayload(null);
      setDirty(false);
      setOpenError("");
    });
    if (!stationId || !siteId || !siteSubtypeId || !payloadReady) {
      queueMicrotask(() => {
        if (generation === generationRef.current) setStatus("idle");
      });
      return;
    }

    const key = scopedDraftKey(stationId, siteId, siteSubtypeId);
    const client = getSupabaseBrowserClient();
    const local = adminMode ? null : readScopedLocalDraft(key);
    if (local?.payload) onRemotePayload(local.payload);

    if (adminMode && !adminSubmissionId) {
      queueMicrotask(() => {
        if (generation !== generationRef.current) return;
        initializedKeyRef.current = key;
        versionRef.current = 0;
        lastSavedFingerprintRef.current = "";
        setStatus("browsing");
      });
      return;
    }

    if (!client) {
      queueMicrotask(() => {
        if (generation !== generationRef.current) return;
        initializedKeyRef.current = key;
        versionRef.current = local?.serverVersion ?? 0;
        lastSavedFingerprintRef.current = local?.payload ? payloadFingerprint(local.payload) : "";
        setStatus("browsing");
      });
      return;
    }

    queueMicrotask(() => {
      if (generation === generationRef.current) setStatus("opening");
    });
    void (async () => {
      const { data, error } = adminSubmissionId
        ? await client.rpc("admin_get_submission_state", { p_submission_id: adminSubmissionId })
        : await client.rpc("get_submission_state", {
          p_site_id: siteId,
          p_site_subtype_id: siteSubtypeId,
        });
      if (generation !== generationRef.current) return;
      initializedKeyRef.current = key;
      if (error) {
        setOpenError(siteSubtypeError(error));
        versionRef.current = local?.serverVersion ?? 0;
        lastSavedFingerprintRef.current = local?.payload ? payloadFingerprint(local.payload) : "";
        setStatus("browsing");
        return;
      }

      const row = firstRow(data as RpcState[]);
      const serverPayload = row?.payload && "schemaVersion" in row.payload ? row.payload as DraftPayload : null;
      const choice = chooseInitialDraft(local, serverPayload, row?.version ?? 0);
      versionRef.current = row?.version ?? local?.serverVersion ?? 0;
      setHasServerDraft(Boolean(serverPayload));
      setLockOperator(row?.lock_operator_name ?? "");
      setLockLastActivityAt(row?.lock_last_activity_at ?? null);
      setLastSavedAt(row?.last_saved_at ?? null);
      const lockIsExpired = Boolean(
        row?.lock_last_activity_at && new Date(row.lock_last_activity_at).getTime() < Date.now() - 5 * 60_000,
      );
      const lockIsActive = Boolean(row?.lock_last_activity_at && !lockIsExpired);
      setCanTakeover(lockIsExpired);

      if (choice.kind === "conflict") {
        setLatestPayload(choice.payload);
        setStatus("conflict");
      } else {
        if (choice.payload) onRemotePayload(choice.payload);
        lastSavedFingerprintRef.current = serverPayload ? payloadFingerprint(serverPayload) : "";
        setStatus(lockIsActive ? "read-only" : "browsing");
      }
    })();
  // Browse changes only read state; they must not acquire or release locks.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminMode, adminSubmissionId, payloadReady, retryTick, siteId, siteSubtypeId, stationId]);

  useEffect(() => {
    if (!isEditing || !stationId || !siteId || !siteSubtypeId || !serializedPayload || !initializedKeyRef.current) return;
    const key = scopedDraftKey(stationId, siteId, siteSubtypeId);
    if (key !== initializedKeyRef.current) return;
    const currentPayload = JSON.parse(serializedPayload) as DraftPayload;
    writeScopedLocalDraft(key, { payload: currentPayload, serverVersion: versionRef.current, updatedAt: new Date().toISOString() });
    if (!dirty) {
      maxWaitStartedRef.current = null;
      return;
    }
    const now = Date.now();
    if (maxWaitStartedRef.current === null) maxWaitStartedRef.current = now;
    const waitMs = now - maxWaitStartedRef.current >= 18_000 ? 0 : 5_000;
    const timer = window.setTimeout(() => {
      maxWaitStartedRef.current = null;
      void saveNow();
    }, waitMs);
    return () => window.clearTimeout(timer);
  }, [dirty, isEditing, saveNow, serializedPayload, siteId, siteSubtypeId, stationId]);

  const retryAcquireEdit = useCallback(async () => {
    if (!scope) return false;
    if (adminMode && !adminSubmissionId) return false;
    const key = scopedDraftKey(scope.stationId, scope.siteId, scope.siteSubtypeId);
    const client = getSupabaseBrowserClient();
    if (!client) {
      initializedKeyRef.current = key;
      setIsEditing(true);
      setDirty(false);
      setStatus("local-only");
      return true;
    }

    // A previous read-only/conflict response is only a snapshot. Every explicit
    // edit attempt must acquire against the current server lock state.
    generationRef.current += 1;
    setLatestPayload(null);
    setCanTakeover(false);
    setLockOperator("");
    setLockLastActivityAt(null);
    setIsEditing(false);
    setDirty(false);
    setStatus("opening");
    setOpenError("");
    const { data, error } = adminSubmissionId
      ? await client.rpc("admin_open_submission", {
        p_submission_id: adminSubmissionId,
        p_session_id: getTabSessionId(),
        p_operator_name: operatorName || "Super Admin",
      })
      : await client.rpc("open_submission", {
        p_site_id: scope.siteId,
        p_site_subtype_id: scope.siteSubtypeId,
        p_session_id: getTabSessionId(),
        p_operator_name: operatorName || null,
      });
    if (error) {
      const message = siteSubtypeError(error);
      setOpenError(message);
      setStatus(message ? "browsing" : "local-only");
      return false;
    }
    const row = firstRow(data as RpcState[]);
    if (!row) return false;
    const serverPayload = row.payload && "schemaVersion" in row.payload ? row.payload as DraftPayload : null;
    versionRef.current = row.version;
    initializedKeyRef.current = key;
    setHasServerDraft(Boolean(serverPayload));
    setCanTakeover(Boolean(row.can_takeover));
    setLockOperator(row.lock_operator_name ?? operatorName);
    setLockLastActivityAt(row.lock_last_activity_at ?? null);
    setLastSavedAt(row.last_saved_at ?? null);

    if (row.can_edit && serverPayload) onRemotePayload(serverPayload);
    lastSavedFingerprintRef.current = serverPayload ? payloadFingerprint(serverPayload) : "";
    if (row.can_edit) {
      setLatestPayload(null);
      setIsEditing(true);
      setDirty(false);
      setStatus("editing");
      return true;
    }
    setIsEditing(false);
    setDirty(false);
    setOpenError("");
    setStatus("read-only");
    return false;
  }, [adminMode, adminSubmissionId, onRemotePayload, operatorName, scope]);

  const startEditing = retryAcquireEdit;

  const touchActivity = useCallback(() => {
    if (!scope || !isEditing || Date.now() - lastTouchRef.current < 45_000) return;
    lastTouchRef.current = Date.now();
    const client = getSupabaseBrowserClient();
    if (!client) return;
    void (async () => {
      const { data } = adminSubmissionId
        ? await client.rpc("admin_touch_submission_lock", {
          p_submission_id: adminSubmissionId,
          p_session_id: getTabSessionId(),
          p_operator_name: operatorName || "Super Admin",
        })
        : await client.rpc("touch_submission_lock", {
          p_site_id: scope.siteId,
          p_site_subtype_id: scope.siteSubtypeId,
          p_session_id: getTabSessionId(),
          p_operator_name: operatorName || null,
        });
      if (data === false) {
        setIsEditing(false);
        setDirty(false);
        setStatus("read-only");
      } else {
        setLockLastActivityAt(new Date().toISOString());
      }
    })();
  }, [adminSubmissionId, isEditing, operatorName, scope]);

  const takeover = useCallback(async () => {
    if (!scope) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const { data, error } = adminSubmissionId
      ? await client.rpc("admin_force_takeover_submission", {
        p_submission_id: adminSubmissionId,
        p_session_id: getTabSessionId(),
        p_operator_name: operatorName || "Super Admin",
      })
      : await client.rpc("takeover_submission_lock", {
        p_site_id: scope.siteId,
        p_site_subtype_id: scope.siteSubtypeId,
        p_session_id: getTabSessionId(),
        p_operator_name: operatorName || null,
      });
    const row = firstRow(data as Array<RpcState & { acquired: boolean }>);
    if (!error && row?.acquired) {
      versionRef.current = row.version;
      if (row.payload && "schemaVersion" in row.payload) onRemotePayload(row.payload as DraftPayload);
      setIsEditing(true);
      setDirty(false);
      setCanTakeover(false);
      setLockOperator(row.lock_operator_name ?? operatorName);
      setLockLastActivityAt(row.lock_last_activity_at ?? null);
      setStatus("editing");
    }
  }, [adminSubmissionId, onRemotePayload, operatorName, scope]);

  const loadLatest = useCallback(() => {
    if (!latestPayload) return;
    onRemotePayload(latestPayload);
    lastSavedFingerprintRef.current = payloadFingerprint(latestPayload);
    setLatestPayload(null);
    setIsEditing(false);
    setDirty(false);
    setStatus("browsing");
  }, [latestPayload, onRemotePayload]);

  const finishEditing = useCallback(async () => {
    if (dirty) {
      const result = await saveNow();
      if (result !== "saved" && result !== "skipped") return result;
    }
    const released = await release();
    if (!released) return "release-pending" as const;
    return "finished" as const;
  }, [dirty, release, saveNow]);

  const reopen = retryAcquireEdit;

  return {
    status,
    canEdit,
    isEditing,
    dirty,
    canTakeover,
    hasServerDraft,
    lockOperator,
    lockLastActivityAt,
    lastSavedAt,
    openError,
    touchActivity,
    startEditing,
    retryAcquireEdit,
    saveNow,
    finishEditing,
    takeover,
    loadLatest,
    reopen,
    release,
  };
}
