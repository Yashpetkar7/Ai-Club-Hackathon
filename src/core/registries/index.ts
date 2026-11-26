import type { RegistryRecord } from '@/core/contracts';
import type { Registries } from '@/core/verify/verdict';
import { getJson, RegistryError } from './http';
import { fromCrossref, fromDataCite, fromOpenAlex } from './map';
import { retractionWatch } from './retractionWatch';

const OA_FIELDS = 'id,doi,title,display_name,publication_year,authorships,primary_location,biblio,type,type_crossref,is_retracted,cited_by_count,open_access,referenced_works,abstract_inverted_index';

const doiPath = (d: string): string => d.split('/').map(encodeURIComponent).join('/');

export const registries: Registries = {
  async crossrefByDoi(doi) {
    const j = await getJson<{ message: Record<string, unknown> }>(`https://api.crossref.org/works/${doiPath(doi)}`, 'crossref');
    return j ? fromCrossref(j.message) : null;
  },
  async openalexByDoi(doi) {
    const j = await getJson<Record<string, unknown>>(`https://api.openalex.org/works/doi:${doiPath(doi)}?select=${OA_FIELDS}`, 'openalex');
    return j ? fromOpenAlex(j) : null;
  },
  async dataciteByDoi(doi) {
    const j = await getJson<{ data: Record<string, unknown> }>(`https://api.datacite.org/dois/${doiPath(doi)}`, 'other');
    return j ? fromDataCite(j.data) : null;
  },
  async doiExists(doi) {
    const j = await getJson<{ responseCode: number }>(`https://doi.org/api/handles/${doiPath(doi)}`, 'other');
    if (!j) return false;
    if (j.responseCode === 1 || j.responseCode === 200) return true;
    if (j.responseCode === 100) return false;
    throw new RegistryError(`doi.org code ${j.responseCode}`);
  },
  async crossrefSearch(query) {
    const q = encodeURIComponent(query.slice(0, 400));
    const j = await getJson<{ message: { items: Record<string, unknown>[] } }>(`https://api.crossref.org/works?rows=6&query.bibliographic=${q}`, 'crossref-search');
    return (j?.message.items ?? []).map(fromCrossref).filter((r) => r.title);
  },
  async openalexSearch(query, hint) {
    const get = async (url: string) => ((await getJson<{ results: Record<string, unknown>[] }>(url, 'openalex'))?.results ?? []).map(fromOpenAlex).filter((r) => r.title);
    // With a title, ask OpenAlex for that title (near the stated year first, then any year). Ranked by OpenAlex, compared by our code.
    const t = hint?.title?.replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (t && t.split(' ').length >= 2) {
      const base = `https://api.openalex.org/works?per-page=6&sort=cited_by_count:desc&select=${OA_FIELDS}&filter=title.search:${encodeURIComponent(t)}`;
      const near = hint?.year ? await get(`${base},publication_year:${hint.year - 1}-${hint.year + 1}`) : [];
      if (near.length) return near;
      const any = await get(base);
      if (any.length) return any;
    }
    return get(`https://api.openalex.org/works?search=${encodeURIComponent(query.slice(0, 300))}&per-page=6&select=${OA_FIELDS}`);
  },
  retractionWatch: (doi) => retractionWatch.lookup(doi),
};

export interface RetractedRef { id: string; title: string; doi?: string; year?: number }

/** Retracted works in one work's own reference list, as OpenAlex holds it. One small request. */
export async function retractedReferences(openalexId: string): Promise<RetractedRef[]> {
  if (!/^W\d+$/.test(openalexId)) return [];
  const j = await getJson<{ results: Record<string, any>[] }>(`https://api.openalex.org/works?filter=cited_by:${openalexId},is_retracted:true&per-page=25&select=id,doi,title,publication_year`, 'openalex');
  return (j?.results ?? []).map((w) => {
    const r = fromOpenAlex(w);
    return { id: r.id, title: r.title, ...(r.doi ? { doi: r.doi } : {}), ...(r.year ? { year: r.year } : {}) };
  });
}

/** Full records for a handful of OpenAlex ids, in one request. */
export async function worksById(ids: string[]): Promise<RegistryRecord[]> {
  const ok = ids.filter((x) => /^W\d+$/.test(x)).slice(0, 50);
  if (!ok.length) return [];
  const j = await getJson<{ results: Record<string, unknown>[] }>(`https://api.openalex.org/works?filter=openalex:${ok.join('|')}&per-page=${ok.length}&select=${OA_FIELDS}`, 'openalex');
  return (j?.results ?? []).map(fromOpenAlex).filter((r) => r.title);
}

export interface SearchOptions {
  fromYear?: number;
  perPage?: number;
  openAccessOnly?: boolean;
}

/**
 * The Scout. OpenAlex first because it carries abstracts; Crossref when OpenAlex is out of budget.
 * Says which registry answered so the page can show it.
 */
export async function searchPapers(query: string, o: SearchOptions = {}): Promise<{ registry: 'openalex' | 'crossref'; records: RegistryRecord[]; note?: string }> {
  const n = o.perPage ?? 12;
  const filters = ['has_doi:true', 'is_retracted:false', ...(o.fromYear ? [`from_publication_date:${o.fromYear}-01-01`] : []), ...(o.openAccessOnly ? ['is_oa:true'] : [])];
  try {
    const j = await getJson<{ results: Record<string, unknown>[] }>(
      `https://api.openalex.org/works?search=${encodeURIComponent(query)}&filter=${filters.join(',')}&per-page=${n}&select=${OA_FIELDS}`,
      'openalex',
    );
    return { registry: 'openalex', records: (j?.results ?? []).map(fromOpenAlex).filter((r) => r.title) };
  } catch (e) {
    const why = e instanceof Error ? e.message : 'no answer';
    // Ask Crossref for works that carry an abstract first, because claims need text to be checked against.
    const ask = async (extra: string[]): Promise<RegistryRecord[]> => {
      const f = [...(o.fromYear ? [`from-pub-date:${o.fromYear}`] : []), ...extra];
      const j = await getJson<{ message: { items: Record<string, unknown>[] } }>(`https://api.crossref.org/works?rows=${n}&query.bibliographic=${encodeURIComponent(query)}${f.length ? `&filter=${f.join(',')}` : ''}`, 'crossref-search');
      return (j?.message.items ?? []).map(fromCrossref).filter((r) => r.title && !r.retracted);
    };
    let records = await ask(['has-abstract:true']);
    if (records.length < 4) records = [...new Map([...records, ...(await ask([]))].map((r) => [r.id, r])).values()];
    return { registry: 'crossref', records, note: `OpenAlex search did not answer (${why}), so these came from Crossref.` };
  }
}
