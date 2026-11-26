import type { ReferenceCheck, RegistryRecord } from '@/core/contracts';
import { registries, searchPapers } from '@/core/registries';
import { cleanTitle } from '@/core/verify/normalise';
import { checkReference, type Registries } from '@/core/verify/verdict';
import { fuse, type Fused } from './fuse';
import { openalexByMeaning, type Found } from './openalex';

export { FOUND_BY, RRF_K, fuse, whyItAppears, type FoundBy, type Fused } from './fuse';
export { MEANING_LANE, MEANING_MAX, OA_FIELDS, bareOpenalexId, meaningUrl, openalexByMeaning, parseWorks, relatedTo, relatedUrl, type Found } from './openalex';

/** Why a search gave nothing: no connection, a registry's free daily limit, or no answer at all. */
export type Trouble = 'offline' | 'limit' | 'no-answer';

export function troubleOf(e: unknown, online = typeof navigator === 'undefined' || navigator.onLine !== false): Trouble {
  if (!online) return 'offline';
  const m = e instanceof Error ? e.message : '';
  return /daily limit|HTTP 429/.test(m) ? 'limit' : 'no-answer';
}

export const TROUBLE_TEXT: Record<Trouble, string> = {
  offline: 'You are offline, so nothing could be searched.',
  limit: 'OpenAlex says its free daily limit is used up. It resets each day.',
  'no-answer': 'The registry did not answer.',
};

export interface Lane {
  /** How many works this search gave, before merging. */
  count: number;
  trouble?: Trouble;
  /** Said by the search itself, for example that Crossref answered because OpenAlex did not. */
  note?: string;
}

export interface Discovery {
  hits: Fused[];
  words: Lane;
  meaning: Lane;
}

export interface DiscoverOptions {
  perPage?: number;
  fromYear?: number;
}

/** Both questions are injectable so the fusion and the partial states can be tested without a network. */
export interface Searchers {
  byWords(query: string, o: DiscoverOptions): Promise<{ records: RegistryRecord[]; note?: string }>;
  byMeaning(query: string, o: DiscoverOptions): Promise<Found[]>;
}

const live: Searchers = {
  // The same keyword search Find uses, with Find's filters, and Find's fallback to Crossref.
  byWords: (q, o) => searchPapers(q, { perPage: o.perPage ?? 10, ...(o.fromYear ? { fromYear: o.fromYear } : {}) }),
  byMeaning: (q, o) => openalexByMeaning(q, { perPage: o.perPage ?? 10, ...(o.fromYear ? { fromYear: o.fromYear } : {}) }),
};

/**
 * Searches by words and by meaning at once and merges the two lists. One search failing still returns the other,
 * with the failure said. Both failing throws, because no answer is never "nothing found".
 */
export async function discover(query: string, o: DiscoverOptions = {}, s: Searchers = live): Promise<Discovery> {
  const [w, m] = await Promise.allSettled([s.byWords(query, o), s.byMeaning(query, o)]);
  if (w.status === 'rejected' && m.status === 'rejected') throw m.reason instanceof Error ? m.reason : new Error('no answer');
  const words: Found[] = w.status === 'fulfilled' ? w.value.records.map((record) => ({ record, openAccess: !!record.openAccessUrl })) : [];
  const meaning: Found[] = m.status === 'fulfilled' ? m.value : [];
  const note = w.status === 'fulfilled' ? w.value.note : undefined;
  return {
    hits: fuse(words, meaning),
    words: { count: words.length, ...(w.status === 'rejected' ? { trouble: troubleOf(w.reason) } : {}), ...(note ? { note } : {}) },
    meaning: { count: meaning.length, ...(m.status === 'rejected' ? { trouble: troubleOf(m.reason) } : {}) },
  };
}

/**
 * The checker's answer for a work found here, asked exactly as Find asks it. Plain code; nothing on this page
 * sets a verdict. The abstract OpenAlex gave is kept on the checked record, as Find keeps it.
 */
export async function checkFound(rec: RegistryRecord, reg: Registries = registries): Promise<ReferenceCheck> {
  const title = cleanTitle(rec.title);
  const check = await checkReference({ raw: title, title, authors: rec.authors.slice(0, 6).map((a) => a.family), ...(rec.year ? { year: rec.year } : {}), ...(rec.doi ? { doi: rec.doi } : {}) }, reg);
  return check.record ? { ...check, record: { ...check.record, abstract: check.record.abstract ?? rec.abstract } as RegistryRecord } : check;
}
