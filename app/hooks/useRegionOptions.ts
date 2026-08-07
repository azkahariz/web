"use client";

import { useEffect, useState } from "react";

export const REGION_API_ROUTE = "/api/regions";

export type RegionOption = { code: string; name: string };
type RegionApiResponse = { data?: Array<{ code: string | number; name: string }> };

const regionCache = new Map<string, RegionOption[]>();

export function normalizeRegionCode(code: string, level: 1 | 2 | 3 | 4) {
  const digits = code.replace(/\D/g, "");
  const lengths = [2, 2, 2, 4].slice(0, level);
  const parts: string[] = [];
  let offset = 0;

  for (const length of lengths) {
    parts.push(digits.slice(offset, offset + length));
    offset += length;
  }

  return parts.filter(Boolean).join(".");
}

export function useRegionOptions(path: string | null, reloadToken: number) {
  const [result, setResult] = useState<{
    path: string | null;
    reloadToken: number;
    options: RegionOption[];
    error: boolean;
  }>({ path: null, reloadToken: -1, options: [], error: false });

  useEffect(() => {
    if (!path || regionCache.has(path)) return;

    const controller = new AbortController();
    fetch(`${REGION_API_ROUTE}?path=${encodeURIComponent(path)}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json() as RegionApiResponse;
        if (!Array.isArray(body.data)) throw new Error("Respons wilayah tidak valid");
        return body.data.map((item) => ({ code: String(item.code), name: item.name }));
      })
      .then((items) => {
        regionCache.set(path, items);
        setResult({ path, reloadToken, options: items, error: false });
      })
      .catch((fetchError: unknown) => {
        if (!(fetchError instanceof DOMException && fetchError.name === "AbortError")) {
          setResult({ path, reloadToken, options: [], error: true });
        }
      });

    return () => controller.abort();
  }, [path, reloadToken]);

  const cached = path ? regionCache.get(path) : undefined;
  const isCurrent = result.path === path && result.reloadToken === reloadToken;

  return {
    options: cached ?? (isCurrent ? result.options : []),
    loading: Boolean(path && !cached && !isCurrent),
    error: Boolean(path && !cached && isCurrent && result.error),
  };
}
