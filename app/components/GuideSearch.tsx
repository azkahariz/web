"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  GUIDE_SEARCH_RESULT_LIMIT,
  normalizeGuideSearchText,
  rankGuideSearchItems,
  type GuideSearchItem,
} from "../lib/guide-search";
import type { GuideAudience } from "../lib/guide-updates";

type GuideSearchCopy = {
  label: string;
  placeholder: string;
  noResultExamples: string;
};

const COPY: Record<GuideAudience, GuideSearchCopy> = {
  station: {
    label: "Cari di Panduan",
    placeholder: "Cari panduan, misalnya serial number atau data sedang diedit",
    noResultExamples: "Coba kata yang lebih singkat, misalnya Produk, Site, Simpan, atau Gudang.",
  },
  admin: {
    label: "Cari di Panduan Super Admin",
    placeholder: "Cari panduan, misalnya QC, gabungkan Produk, atau hapus permanen",
    noResultExamples: "Coba kata yang lebih singkat, misalnya Produk, Submission, Lock, atau QC.",
  },
};

function collectGuideSearchItems(root: HTMLElement) {
  const taskTextByTarget = new Map<string, string[]>();
  root.querySelectorAll<HTMLAnchorElement>('.guide-task-nav a[href^="#"]').forEach((link) => {
    const target = link.hash.slice(1);
    if (!target) return;
    taskTextByTarget.set(target, [...(taskTextByTarget.get(target) ?? []), link.textContent ?? ""]);
  });

  return Array.from(root.querySelectorAll<HTMLElement>("section[id]"), (section, order): GuideSearchItem | null => {
    const title = Array.from(section.children).find((child) => child.matches("h3"))?.textContent?.trim()
      ?? section.querySelector("h3")?.textContent?.trim()
      ?? "";
    if (!title) return null;
    const subheadings = Array.from(
      section.querySelectorAll<HTMLElement>("h4, .guide-disclosure summary strong, .guide-glossary dt"),
      (heading) => heading.textContent?.trim() ?? "",
    ).filter(Boolean);
    return {
      id: section.id,
      title,
      category: section.querySelector<HTMLElement>(".guide-section-label")?.textContent?.trim() ?? "",
      subheadings,
      body: section.textContent?.replace(/\s+/g, " ").trim() ?? "",
      keywords: section.dataset.guideKeywords ?? "",
      taskText: (taskTextByTarget.get(section.id) ?? []).join(" "),
      order,
    };
  }).filter((item): item is GuideSearchItem => item !== null);
}

export default function GuideSearch({ audience, rootId }: { audience: GuideAudience; rootId: string }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<GuideSearchItem[]>([]);
  const indexReadyRef = useRef(false);
  const highlightTimeoutRef = useRef<number | null>(null);
  const copy = COPY[audience];
  const normalizedQuery = normalizeGuideSearchText(query);
  const isSearchActive = normalizedQuery.length >= 2;
  const allMatches = useMemo(
    () => isSearchActive ? rankGuideSearchItems(items, query, Number.MAX_SAFE_INTEGER) : [],
    [isSearchActive, items, query],
  );
  const results = allMatches.slice(0, GUIDE_SEARCH_RESULT_LIMIT);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current !== null) window.clearTimeout(highlightTimeoutRef.current);
    };
  }, []);

  function ensureSearchIndex() {
    if (indexReadyRef.current) return;
    const root = document.getElementById(rootId);
    if (root) {
      indexReadyRef.current = true;
      setItems(collectGuideSearchItems(root));
    }
  }

  function highlightTarget(id: string) {
    window.setTimeout(() => {
      const target = document.getElementById(id);
      if (!target) return;
      document.querySelectorAll(".guide-search-target").forEach((element) => element.classList.remove("guide-search-target"));
      target.classList.add("guide-search-target");
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
      if (highlightTimeoutRef.current !== null) window.clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = window.setTimeout(() => target.classList.remove("guide-search-target"), 1800);
    }, 0);
  }

  return (
    <div className="guide-search" role="search" aria-label={copy.label}>
      <label className="guide-search-label" htmlFor={`${audience}-guide-search`}>{copy.label}</label>
      <div className="guide-search-input-wrap">
        <input
          id={`${audience}-guide-search`}
          type="search"
          autoComplete="off"
          value={query}
          onFocus={ensureSearchIndex}
          onChange={(event) => {
            ensureSearchIndex();
            setQuery(event.target.value);
          }}
          placeholder={copy.placeholder}
        />
        {query && <button type="button" className="guide-search-clear" onClick={() => setQuery("")} aria-label="Hapus pencarian" title="Hapus pencarian">X</button>}
      </div>

      {isSearchActive && (
        <div className="guide-search-panel">
          <div className="guide-search-summary" aria-live="polite">
            <strong>Hasil pencarian untuk <q>{query.trim()}</q></strong>
            {allMatches.length > GUIDE_SEARCH_RESULT_LIMIT
              ? <span>Menampilkan {GUIDE_SEARCH_RESULT_LIMIT} hasil paling relevan. Coba gunakan kata yang lebih spesifik.</span>
              : <span>{allMatches.length} bagian ditemukan.</span>}
          </div>
          {results.length > 0 ? (
            <ul className="guide-search-results">
              {results.map((result) => (
                <li key={result.id}>
                  <a href={`#${result.id}`} onClick={() => highlightTarget(result.id)}>
                    {result.category && <span className="guide-search-category">{result.category}</span>}
                    <strong>{result.displayTitle}</strong>
                    <span className="guide-search-snippet">{result.snippet}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="guide-search-empty">
              <strong>Tidak menemukan panduan yang sesuai.</strong>
              <span>{copy.noResultExamples}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
