export type GuideSearchItem = {
  id: string;
  title: string;
  category: string;
  subheadings: string[];
  body: string;
  keywords: string;
  taskText: string;
  order: number;
};

export type GuideSearchResult = GuideSearchItem & {
  displayTitle: string;
  score: number;
  snippet: string;
};

export const GUIDE_SEARCH_RESULT_LIMIT = 8;

export function normalizeGuideSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("id")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function fieldScore(value: string, query: string, terms: string[], base: number) {
  const normalized = normalizeGuideSearchText(value);
  if (!normalized) return 0;
  if (normalized === query) return base + 80;
  if (normalized.startsWith(query)) return base + 60;
  if (normalized.includes(query)) return base + 50;
  if (terms.every((term) => normalized.includes(term))) return base + 30;
  return 0;
}

function bestSubheadingMatch(subheadings: string[], query: string, terms: string[]) {
  return subheadings.reduce<{ heading: string; score: number }>((best, heading) => {
    const score = fieldScore(heading, query, terms, 500);
    return score > best.score ? { heading, score } : best;
  }, { heading: "", score: 0 });
}

export function createGuideSearchSnippet(body: string, query: string, maxLength = 170) {
  const text = body.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;

  const normalizedQuery = normalizeGuideSearchText(query);
  const terms = normalizedQuery.split(" ").filter(Boolean);
  const lowerText = text.toLocaleLowerCase("id");
  const rawQuery = query.trim().toLocaleLowerCase("id");
  let matchIndex = rawQuery ? lowerText.indexOf(rawQuery) : -1;
  if (matchIndex < 0) {
    matchIndex = terms.reduce((found, term) => found >= 0 ? found : lowerText.indexOf(term), -1);
  }

  const start = Math.max(0, Math.min(matchIndex < 0 ? 0 : matchIndex - 45, text.length - maxLength));
  const excerpt = text.slice(start, start + maxLength).trim();
  return `${start > 0 ? "..." : ""}${excerpt}${start + maxLength < text.length ? "..." : ""}`;
}

export function rankGuideSearchItems(
  items: readonly GuideSearchItem[],
  queryValue: string,
  limit = GUIDE_SEARCH_RESULT_LIMIT,
) {
  const query = normalizeGuideSearchText(queryValue);
  if (!query) return [];
  const terms = query.split(" ").filter(Boolean);

  return items
    .map((item): GuideSearchResult | null => {
      const titleScore = fieldScore(item.title, query, terms, 800);
      const keywordScore = fieldScore(item.keywords, query, terms, 650);
      const taskScore = fieldScore(item.taskText, query, terms, 575);
      const subheadingMatch = bestSubheadingMatch(item.subheadings, query, terms);
      const bodyScore = fieldScore(item.body, query, terms, 250);
      const combined = normalizeGuideSearchText([
        item.title,
        item.keywords,
        item.taskText,
        item.subheadings.join(" "),
        item.body,
      ].join(" "));
      if (!terms.every((term) => combined.includes(term))) return null;

      const score = Math.max(titleScore, keywordScore, taskScore, subheadingMatch.score, bodyScore, 100);
      const displayTitle = subheadingMatch.score > titleScore ? subheadingMatch.heading : item.title;
      return {
        ...item,
        displayTitle,
        score,
        snippet: createGuideSearchSnippet(item.body, queryValue),
      };
    })
    .filter((item): item is GuideSearchResult => item !== null)
    .toSorted((left, right) => right.score - left.score || left.order - right.order || left.title.localeCompare(right.title, "id"))
    .slice(0, limit);
}
