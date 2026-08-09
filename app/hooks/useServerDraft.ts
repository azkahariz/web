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

export type DraftSyncState = "idle" | "opening" | "saved" | "saving" | "local-only" | "read-only" | "conflict";

function firstRow<T>(value: T[] | T | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function useServerDraft({
  scope,
  payload,
  operatorName,
  onRemotePayload,
}: {
  scope: Scope | null;
  payload: DraftPayload | null;
  operatorName: string;
  onRemotePayload: (payload: DraftPayload) => void;
}) {
  const [status, setStatus] = useState<DraftSyncState>("idle");
  const [canEdit, setCanEdit] = useState(false);
  const [canTakeover, setCanTakeover] = useState(false);
  const [lockOperator, setLockOperator] = useState("");
  const [lockLastActivityAt, setLockLastActivityAt] = useState<string | null>(null);
  const [latestPayload, setLatestPayload] = useState<DraftPayload | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const versionRef = useRef(0);
  const initializedKeyRef = useRef("");
  const lastSavedFingerprintRef = useRef("");
  const lastTouchRef = useRef(0);
  const generationRef = useRef(0);
  const stationId = scope?.stationId ?? "";
  const siteId = scope?.siteId ?? "";
  const siteSubtypeId = scope?.siteSubtypeId ?? "";
  const serializedPayload = payload ? payloadFingerprint(payload) : "";

  useEffect(() => {
    const retry = () => setRetryTick((value) => value + 1);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);

  const release = useCallback(async (target = scope) => {
    if (!target || !initializedKeyRef.current) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    await client.rpc("release_submission_lock", {
      p_site_id: target.siteId,
      p_site_subtype_id: target.siteSubtypeId,
      p_session_id: getTabSessionId(),
    });
  }, [scope]);

  useEffect(() => {
    const generation = ++generationRef.current;
    initializedKeyRef.current = "";
    queueMicrotask(() => {
      if (generation !== generationRef.current) return;
      setCanEdit(false);
      setCanTakeover(false);
      setLatestPayload(null);
    });
    if (!stationId || !siteId || !siteSubtypeId || !serializedPayload) {
      queueMicrotask(() => {
        if (generation === generationRef.current) setStatus("idle");
      });
      return;
    }

    const key = scopedDraftKey(stationId, siteId, siteSubtypeId);
    const client = getSupabaseBrowserClient();
    if (!client) {
      queueMicrotask(() => {
        if (generation !== generationRef.current) return;
        initializedKeyRef.current = key;
        versionRef.current = 0;
        setCanEdit(true);
        setStatus("local-only");
      });
      return;
    }

    queueMicrotask(() => {
      if (generation === generationRef.current) setStatus("opening");
    });
    void (async () => {
      const { data, error } = await client.rpc("open_submission", {
        p_site_id: siteId,
        p_site_subtype_id: siteSubtypeId,
        p_session_id: getTabSessionId(),
        p_operator_name: operatorName || null,
      });
      if (generation !== generationRef.current) return;
      if (error) {
        initializedKeyRef.current = key;
        setCanEdit(true);
        setStatus("local-only");
        return;
      }

      const row = firstRow(data as RpcState[]);
      if (!row) return;
      const serverPayload = row.payload && "schemaVersion" in row.payload ? row.payload as DraftPayload : null;
      const local = readScopedLocalDraft(key);
      const choice = chooseInitialDraft(local, serverPayload, row.version);
      versionRef.current = row.version;
      initializedKeyRef.current = key;
      setCanEdit(Boolean(row.can_edit));
      setCanTakeover(Boolean(row.can_takeover));
      setLockOperator(row.lock_operator_name ?? "");
      setLockLastActivityAt(row.lock_last_activity_at ?? null);
      setLastSavedAt(row.last_saved_at ?? null);

      if (choice.kind === "conflict") {
        setLatestPayload(choice.payload);
        setStatus("conflict");
      } else {
        if (choice.payload) onRemotePayload(choice.payload);
        lastSavedFingerprintRef.current = serverPayload ? payloadFingerprint(serverPayload) : "";
        setStatus(row.can_edit ? (choice.kind === "local" ? "local-only" : "saved") : "read-only");
      }
    })();
    return () => {
      void client.rpc("release_submission_lock", {
        p_site_id: siteId,
        p_site_subtype_id: siteSubtypeId,
        p_session_id: getTabSessionId(),
      });
    };
  // A scope change intentionally opens a new server draft only once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryTick, siteId, siteSubtypeId, stationId]);

  useEffect(() => {
    if (!stationId || !siteId || !siteSubtypeId || !serializedPayload || !initializedKeyRef.current) return;
    const currentPayload = JSON.parse(serializedPayload) as DraftPayload;
    const key = scopedDraftKey(stationId, siteId, siteSubtypeId);
    if (key !== initializedKeyRef.current) return;
    writeScopedLocalDraft(key, { payload: currentPayload, serverVersion: versionRef.current, updatedAt: new Date().toISOString() });
    if (!canEdit || latestPayload) return;
    const fingerprint = serializedPayload;
    if (fingerprint === lastSavedFingerprintRef.current) return;

    const timer = window.setTimeout(async () => {
      const client = getSupabaseBrowserClient();
      if (!client) {
        setStatus("local-only");
        return;
      }
      setStatus("saving");
      const { data, error } = await client.rpc("save_submission", {
        p_site_id: siteId,
        p_site_subtype_id: siteSubtypeId,
        p_session_id: getTabSessionId(),
        p_expected_version: versionRef.current,
        p_payload: currentPayload,
        p_operator_name: operatorName || null,
      });
      if (error) {
        setStatus("local-only");
        return;
      }
      const row = firstRow(data as Array<{ status: string; version: number; last_saved_at: string | null }>);
      if (!row) return;
      if (row.status === "saved") {
        versionRef.current = row.version;
        lastSavedFingerprintRef.current = fingerprint;
        setLastSavedAt(row.last_saved_at);
        writeScopedLocalDraft(key, { payload: currentPayload, serverVersion: row.version, updatedAt: new Date().toISOString() });
        setStatus("saved");
      } else if (row.status === "version_conflict") {
        const latest = await client.rpc("get_submission_state", { p_site_id: siteId, p_site_subtype_id: siteSubtypeId });
        const latestRow = firstRow(latest.data as RpcState[]);
        if (latestRow?.payload && "schemaVersion" in latestRow.payload) setLatestPayload(latestRow.payload as DraftPayload);
        versionRef.current = row.version;
        setStatus("conflict");
      } else {
        setCanEdit(false);
        setStatus("read-only");
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [canEdit, latestPayload, operatorName, serializedPayload, siteId, siteSubtypeId, stationId]);

  const touchActivity = useCallback(() => {
    if (!scope || !canEdit || Date.now() - lastTouchRef.current < 45_000) return;
    lastTouchRef.current = Date.now();
    const client = getSupabaseBrowserClient();
    if (!client) return;
    void (async () => {
      const { data } = await client.rpc("touch_submission_lock", {
        p_site_id: scope.siteId,
        p_site_subtype_id: scope.siteSubtypeId,
        p_session_id: getTabSessionId(),
        p_operator_name: operatorName || null,
      });
      if (data === false) {
        setCanEdit(false);
        setStatus("read-only");
      } else {
        setLockLastActivityAt(new Date().toISOString());
      }
    })();
  }, [canEdit, operatorName, scope]);

  const takeover = useCallback(async () => {
    if (!scope) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const { data, error } = await client.rpc("takeover_submission_lock", {
      p_site_id: scope.siteId,
      p_site_subtype_id: scope.siteSubtypeId,
      p_session_id: getTabSessionId(),
      p_operator_name: operatorName || null,
    });
    const row = firstRow(data as Array<RpcState & { acquired: boolean }>);
    if (!error && row?.acquired) {
      versionRef.current = row.version;
      if (row.payload && "schemaVersion" in row.payload) onRemotePayload(row.payload as DraftPayload);
      setCanEdit(true);
      setCanTakeover(false);
      setLockOperator(row.lock_operator_name ?? operatorName);
      setLockLastActivityAt(row.lock_last_activity_at ?? null);
      setStatus("saved");
    }
  }, [onRemotePayload, operatorName, scope]);

  const loadLatest = useCallback(() => {
    if (!latestPayload) return;
    onRemotePayload(latestPayload);
    lastSavedFingerprintRef.current = payloadFingerprint(latestPayload);
    setLatestPayload(null);
    setStatus(canEdit ? "saved" : "read-only");
  }, [canEdit, latestPayload, onRemotePayload]);

  const reopen = useCallback(() => setRetryTick((value) => value + 1), []);

  return { status, canEdit, canTakeover, lockOperator, lockLastActivityAt, lastSavedAt, touchActivity, takeover, loadLatest, reopen, release };
}
