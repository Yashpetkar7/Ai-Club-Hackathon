import type { RegistryRecord } from '@/core/contracts';
import { getJson } from '@/core/registries/http';
import { fromOpenAlex } from '@/core/registries/map';

/**
 * Two OpenAlex questions the Find page does not ask: works close in meaning to a question (search.semantic),
 * and the works OpenAlex lists as related to one work (filter=related_to). Both go through the same polite
 * HTTP client (getJson: spacing, cache, retries, the 429 rule) and allow-listed proxy as every other registry call,
 * to the same host Find already uses. Neither decides anything about a work:
 * whatever the student adds is checked by src/core/verify and waits for the student's approval.
 */

/** OpenAlex answers 400 above this for a search by meaning ("per_page cannot exceed 50 for semantic search"). */
export const MEANING_MAX = 50;

/**
 * The same fields src/core/registries/index.ts asks OpenAlex for, so a work reads the same on every page.
 * A copy, because that file is pinned by the Lab's recorded evidence (tests/offline/lab-sample.test.mjs).
 */
export const OA_FIELDS = 'id,doi,title,display_name,publication_year,authorships,primary_location,biblio,type,type_crossref,is_retracted,cited_by_count,open_access,referenced_works,abstract_inverted_index';

/**
 * The lane name for searches by meaning. getJson spaces an unknown lane like 'other' (120 ms) and keeps its own
 * "come back later" bucket, so a used-up daily limit here never closes the free DOI lookups the checker needs.
 */
export const MEANING_LANE = 'openalex-meaning';

export interface Found {
  record: RegistryRecord;
  /** OpenAlex's own open-access flag, or a free copy we have a link to. */
  openAccess: boolean;
}

type Json = Record<string, any>;

/** One OpenAlex list answer as records. Works without a title are left out; nothing is filled in. */
export function parseWorks(body: { results?: Json[] } | null | undefined): Found[] {
  return (body?.results ?? [])
    .map((w) => {
      const record = fromOpenAlex(w);
      return { record, openAccess: w.open_access?.is_oa === true || !!record.openAccessUrl };
    })
    .filter((f) => f.record.title);
}

export interface MeaningOptions {
  perPage?: number;
  fromYear?: number;
  openAccessOnly?: boolean;
}

/** The address of a search by meaning. Pure, so the tests can hold it to what OpenAlex accepts. */
export function meaningUrl(query: string, o: MeaningOptions = {}): string {
  const n = Math.max(1, Math.min(MEANING_MAX, Math.round(o.perPage ?? 10)));
  // Next to a search by meaning OpenAlex accepts publication_year and is_oa, but refuses has_doi and from_publication_date.
  const filters: string[] = [];
  if (o.fromYear) filters.push(`publication_year:>${o.fromYear - 1}`);
  if (o.openAccessOnly) filters.push('is_oa:true');
  return `https://api.openalex.org/works?search.semantic=${encodeURIComponent(query.trim().slice(0, 300))}${filters.length ? `&filter=${filters.join(',')}` : ''}&per-page=${n}&select=${OA_FIELDS}`;
}

/**
 * Works close in meaning to the question, closest first, as OpenAlex ranks them.
 * Retracted works are not filtered out: the page shows OpenAlex's retraction flag instead.
 */
export async function openalexByMeaning(query: string, o: MeaningOptions = {}): Promise<Found[]> {
  if (!query.trim()) return [];
  return parseWorks(await getJson<{ results: Json[] }>(meaningUrl(query, o), MEANING_LANE));
}

export const bareOpenalexId = (id: string | undefined): string | undefined => {
  const x = (id ?? '').replace(/^https?:\/\/openalex\.org\//i, '');
  return /^W\d+$/.test(x) ? x : undefined;
};

export const relatedUrl = (openalexId: string, n = 10): string =>
  `https://api.openalex.org/works?filter=related_to:${openalexId}&per-page=${Math.max(1, Math.min(50, n))}&select=${OA_FIELDS}`;

/** The works OpenAlex lists as related to one work, in OpenAlex's own order. One request. */
export async function relatedTo(openalexId: string, n = 10): Promise<Found[]> {
  const id = bareOpenalexId(openalexId);
  if (!id) return [];
  return parseWorks(await getJson<{ results: Json[] }>(relatedUrl(id, n), 'openalex')).filter((f) => f.record.id !== id);
}
