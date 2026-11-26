import type { ReferenceCheck, RegistryRecord } from '../contracts';

export type PriorityMode = 'balanced' | 'relevance' | 'recent';
export type ReviewTier = 'matched' | 'unresolved' | 'review';
export interface ResearchItem { key: string; record: RegistryRecord; check?: ReferenceCheck }
export const PRIORITY_PRESETS = {
  balanced: { label: 'Balanced reading', weights: { relevance: 70, recency: 10, coverage: 20 } },
  relevance: { label: 'Topic first', weights: { relevance: 90, recency: 0, coverage: 10 } },
  recent: { label: 'Recent work', weights: { relevance: 60, recency: 30, coverage: 10 } },
} as const;
export const TIER_LABEL: Record<ReviewTier, string> = { matched: 'Metadata matched', unresolved: 'Check incomplete', review: 'Review warning' };
const STOP = new Set('a an and are as at be been by can do does for from had has have how in into is it its of on or our should that the their these this to was were what when where which who why will with would'.split(' '));
const terms = (s: string): string[] => [...new Set(s.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].filter((x) => x.length > 1 && !STOP.has(x));
const round = (n: number): number => Math.round(n * 10) / 10;

export interface ResearchPriority {
  score: number;
  tier: ReviewTier;
  parts: { relevance: number; recency: number | null; coverage: number };
  matched: string[];
  missing: string[];
  explanation: string;
}

/** An ordering aid, never a verdict, quality measure, or approval. No popularity term. */
export function priorityFor(item: ResearchItem, question: string, mode: PriorityMode = 'balanced', year = new Date().getFullYear()): ResearchPriority {
  const r = item.check?.record ?? item.record;
  const q = terms(question);
  const title = new Set(terms(r.title));
  const abstract = new Set(terms(r.abstract ?? item.record.abstract ?? ''));
  const matched = q.filter((t) => title.has(t) || abstract.has(t));
  const relevance = q.length ? q.reduce((n, t) => n + (title.has(t) ? 1 : abstract.has(t) ? 0.65 : 0), 0) / q.length * 100 : 0;
  const hasYear = typeof r.year === 'number' && Number.isInteger(r.year) && r.year >= 1500 && r.year <= year;
  const recency = hasYear ? Math.max(0, 100 - (year - r.year!) * 8) : null;
  const fields: [string, boolean][] = [
    ['DOI', !!r.doi], ['Authors', r.authors.length > 0], ['Publication year', hasYear],
    ['Abstract', !!(r.abstract ?? item.record.abstract)?.trim()], ['Venue', !!r.container?.trim()],
  ];
  const missing = fields.filter(([, present]) => !present).map(([name]) => name);
  const coverage = (fields.length - missing.length) / fields.length * 100;
  const w = PRIORITY_PRESETS[mode].weights;
  // Unknown dates are excluded from the denominator, never replaced with the current year.
  const denominator = w.relevance + w.coverage + (recency === null ? 0 : w.recency);
  const score = round((relevance * w.relevance + (recency ?? 0) * w.recency + coverage * w.coverage) / denominator);
  const verdict = item.check?.verdict;
  const warning = r.retracted || item.record.retracted || r.notices?.some((n) => n.kind === 'concern' || n.kind === 'retraction') || ['retracted', 'wrong-paper', 'details-differ'].includes(verdict ?? '');
  const tier: ReviewTier = warning ? 'review' : verdict === 'confirmed' && !item.check?.sample ? 'matched' : 'unresolved';
  return {
    score, tier, parts: { relevance: round(relevance), recency, coverage }, matched, missing,
    explanation: 'Reading priority only. Text matching, publication age and available metadata do not establish quality, peer review or scientific truth. Registry checks and your approval stay separate.',
  };
}

/** Review tiers remain visible and independent of the score. Stable ties ignore arrival order. */
export function rankResearch<T extends ResearchItem>(items: readonly T[], question: string, mode: PriorityMode = 'balanced', year = new Date().getFullYear()): { item: T; priority: ResearchPriority }[] {
  const tiers: Record<ReviewTier, number> = { matched: 0, unresolved: 1, review: 2 };
  return items.map((item) => ({ item, priority: priorityFor(item, question, mode, year) }))
    .sort((a, b) => tiers[a.priority.tier] - tiers[b.priority.tier] || b.priority.score - a.priority.score || (a.item.key < b.item.key ? -1 : a.item.key > b.item.key ? 1 : 0));
}
