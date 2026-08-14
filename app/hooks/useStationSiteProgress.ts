"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/client";
import type { StationSubmissionProgress } from "../lib/station-site-progress";

type RpcRow = {
  site_id: string;
  site_subtype_id: string;
  filled_count: number;
  total_count: number;
  progress_kind: "EXPECTED" | "WAREHOUSE";
  warehouse_category_count: number;
  warehouse_unit_count: number;
};

export function useStationSiteProgress(enabled: boolean) {
  const [rows, setRows] = useState<StationSubmissionProgress[]>([]);
  const [loading, setLoading] = useState(enabled);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const client = getSupabaseBrowserClient();
    if (!client) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await client.rpc("list_station_submission_summaries");
    if (!error) {
      setRows(((data ?? []) as RpcRow[]).map((row) => ({
        siteId: row.site_id,
        siteSubtypeId: row.site_subtype_id,
        filledCount: row.filled_count,
        totalCount: row.total_count,
        progressKind: row.progress_kind,
        warehouseCategoryCount: row.warehouse_category_count,
        warehouseUnitCount: row.warehouse_unit_count,
      })));
    }
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void refresh();
    });
    return () => { cancelled = true; };
  }, [enabled, refresh]);

  return { rows, loading, refresh };
}
