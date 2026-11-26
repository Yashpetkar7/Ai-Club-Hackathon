import type { RegistryRecord } from '@/core/contracts';
import model from './model.json';

/**
 * Retraction risk signal. A logistic regression trained by ml/train_risk.py on Crossref records of papers
 * Retraction Watch lists as retracted, against a random sample of ordinary journal articles.
 * It is a reason to read carefully, never a verdict: nothing in src/core/verify reads it, and it never sets a colour.
 */
export const RISK_MODEL = model as unknown as {
  intercept: number;
  numeric: Record<string, number>;
  years: [number, number][];
  publisher: Record<string, number>;
  journal: Record<string, number>;
  bands: { p90: number; p97: number };
  trainedOn: { positives: number; negatives: number };
  test: { n: number; auc: number; aucUnseenJournals: number; aucWithoutNames: number; above_p90: number; above_p97: number };
};

export type RiskBand = 'typical' | 'higher' | 'much-higher';
export interface Risk {
  score: number;
  band: RiskBand;
  /** The facts that pushed the score up most, in plain words. */
  because: string[];
}

const clean = (s?: string): string => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** The same facts ml/train_risk.py reads from a Crossref record. */
export function riskFacts(r: Pick<RegistryRecord, 'year' | 'authors'>): Record<string, number> {
  const n = r.authors.length;
  const out: Record<string, number> = {
    log_authors: Math.log1p(n),
    single_author: n === 1 ? 1 : 0,
    no_authors: n === 0 ? 1 : 0,
  };
  for (const [lo, hi] of RISK_MODEL.years) out[`year_${lo}`] = r.year && r.year >= lo && r.year <= hi ? 1 : 0;
  out.year_unknown = r.year ? 0 : 1;
  return out;
}

const WORDS: Record<string, string> = {
  single_author: 'one author',
  no_authors: 'no authors listed',
  log_authors: 'number of authors',
};

/** Only for Crossref journal articles: the model never saw anything else, so it says nothing about them. */
export function retractionRisk(r: RegistryRecord): Risk | null {
  if (r.registry !== 'crossref' || (r.type && r.type !== 'journal-article')) return null;
  const parts: [string, number][] = [];
  for (const [k, v] of Object.entries(riskFacts(r))) {
    const w = RISK_MODEL.numeric[k] ?? 0;
    if (v) parts.push([k.startsWith('year_') ? (k === 'year_unknown' ? 'year not given' : 'year published') : (WORDS[k] ?? k), w * v]);
  }
  const pub = RISK_MODEL.publisher[clean(r.publisher)];
  if (pub !== undefined) parts.push([`publisher: ${r.publisher}`, pub]);
  const jour = RISK_MODEL.journal[clean(r.container)];
  if (jour !== undefined) parts.push([`journal: ${r.container}`, jour]);
  const score = RISK_MODEL.intercept + parts.reduce((a, [, w]) => a + w, 0);
  const band: RiskBand = score >= RISK_MODEL.bands.p97 ? 'much-higher' : score >= RISK_MODEL.bands.p90 ? 'higher' : 'typical';
  const because = parts
    .filter(([, w]) => w > 0.15)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);
  return { score, band, because };
}
