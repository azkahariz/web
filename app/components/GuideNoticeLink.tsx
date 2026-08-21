"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  GUIDE_SEEN_EVENT,
  GUIDE_SEEN_KEYS,
  GUIDE_ROUTES,
  getGuideNoticeHref,
  isGuideNoticeUnseen,
  readGuideSeenVersion,
  type GuideAudience,
} from "../lib/guide-updates";

const LABELS: Record<GuideAudience, string> = {
  station: "Panduan",
  admin: "Panduan Super Admin",
};

export default function GuideNoticeLink({ audience }: { audience: GuideAudience }) {
  const [seenVersion, setSeenVersion] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const refresh = () => {
      try {
        setSeenVersion(readGuideSeenVersion(window.localStorage, audience));
      } catch {
        setSeenVersion(null);
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === GUIDE_SEEN_KEYS[audience]) refresh();
    };
    refresh();
    window.addEventListener("storage", handleStorage);
    window.addEventListener(GUIDE_SEEN_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(GUIDE_SEEN_EVENT, refresh);
    };
  }, [audience]);

  const label = LABELS[audience];
  const unseen = seenVersion !== undefined && isGuideNoticeUnseen(audience, seenVersion);
  const href = seenVersion === undefined ? GUIDE_ROUTES[audience] : getGuideNoticeHref(audience, seenVersion);
  return (
    <Link
      className={`logout-button guide-notice-link${unseen ? " is-unseen" : ""}`}
      href={href}
      aria-label={unseen ? `${label}. Ada pembaruan panduan yang belum dilihat.` : label}
    >
      {label}
      {unseen && <span className="guide-new-badge" aria-hidden="true">BARU</span>}
    </Link>
  );
}
