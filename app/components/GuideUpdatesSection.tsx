"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  GUIDE_SEEN_EVENT,
  formatGuideDate,
  getGuideUpdates,
  getLatestGuideNoticeVersion,
  markGuideNoticeSeen,
  type GuideAudience,
} from "../lib/guide-updates";

export default function GuideUpdatesSection({ audience }: { audience: GuideAudience }) {
  const sectionRef = useRef<HTMLElement>(null);
  const updates = getGuideUpdates(audience);
  const latestNoticeVersion = getLatestGuideNoticeVersion(audience);
  const latest = updates[0];
  const title = audience === "station" ? "Yang Baru di Panduan" : "Yang Baru untuk Super Admin";

  const markSeen = useCallback(() => {
    if (!latestNoticeVersion) return;
    try {
      markGuideNoticeSeen(window.localStorage, audience, latestNoticeVersion);
      window.dispatchEvent(new CustomEvent(GUIDE_SEEN_EVENT, { detail: { audience, version: latestNoticeVersion } }));
    } catch {
      // The guide remains usable when browser storage is blocked.
    }
  }, [audience, latestNoticeVersion]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    if (window.location.hash === "#yang-baru") {
      window.requestAnimationFrame(markSeen);
      return;
    }
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        markSeen();
        observer.disconnect();
      }
    }, { threshold: 0.35 });
    observer.observe(section);
    return () => observer.disconnect();
  }, [markSeen]);

  if (!latest) return null;
  return (
    <section id="yang-baru" className="guide-updates-section" ref={sectionRef} aria-labelledby={`${audience}-guide-updates-title`}>
      <div className="guide-update-heading">
        <div>
          <p className="guide-update-date">{formatGuideDate(latest.date)}</p>
          <h3 id={`${audience}-guide-updates-title`}>{title}</h3>
        </div>
        <span className="guide-section-badge">BARU</span>
      </div>
      <ul className="guide-update-list">
        {updates.map((update, index) => (
          <li key={`${update.version}-${update.title}`}>
            <div>
              <strong>{update.title}</strong>
              <span className={`guide-update-level level-${update.level}`}>{update.level === "important" ? "PENTING" : update.level === "update" ? "BARU" : "MINOR"}</span>
            </div>
            <p>{update.summary}</p>
            {index === updates.length - 1 && <span className="sr-only">Versi panduan {update.version}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
