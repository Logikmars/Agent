const MAX_TERMS = 2500;

const STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "this",
  "that",
  "что",
  "как",
  "для",
  "или",
  "это",
  "все",
  "про",
  "где",
  "які",
  "для",
  "або",
  "это",
  "the"
]);

export type WeightedTerm = {
  term: string;
  weight: number;
};

export function tokenizeSearchText(text: string, maxTerms = MAX_TERMS): string[] {
  const normalized = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[_-]+/g, " ");
  const matches = normalized.match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  const terms: string[] = [];
  for (const raw of matches) {
    const term = raw.slice(0, 64);
    if (STOP_WORDS.has(term)) continue;
    terms.push(term);
    if (terms.length >= maxTerms) break;
  }
  return terms;
}

export function weightedTerms(parts: Array<{ text: string; weight: number }>, maxTerms = MAX_TERMS): WeightedTerm[] {
  const scores = new Map<string, number>();
  let count = 0;
  for (const part of parts) {
    for (const term of tokenizeSearchText(part.text, maxTerms)) {
      scores.set(term, (scores.get(term) ?? 0) + part.weight);
      count += 1;
      if (count >= maxTerms) break;
    }
    if (count >= maxTerms) break;
  }
  return [...scores.entries()].map(([term, weight]) => ({ term, weight }));
}
