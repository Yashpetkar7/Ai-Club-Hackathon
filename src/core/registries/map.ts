import type { Author, RegistryRecord } from '@/core/contracts';
import { stripTags } from '@/core/verify/normalise';

/** Turns each registry's own JSON into our one record shape. Pure functions, tested on recorded responses. */

type Json = Record<string, any>;

const clean = (s: unknown): string | undefined => {
  if (typeof s !== 'string') return undefined;
  const v = stripTags(s);
  return v || undefined;
};

function drop<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

const crossrefYear = (m: Json): number | undefined => {
  for (const k of ['issued', 'published-print', 'published-online', 'published', 'created']) {
    const y = m[k]?.['date-parts']?.[0]?.[0];
    if (y) return Number(y);
  }
  return undefined;
};

const isRetraction = (u: Json): boolean => /^(retraction|withdrawal|removal|retracted)$/i.test(String(u.type ?? u.label ?? ''));

export function fromCrossref(m: Json): RegistryRecord {
  const rawTitle = String(m.title?.[0] ?? '');
  const sub = m.subtitle?.[0];
  const title = stripTags(sub && !rawTitle.toLowerCase().includes(String(sub).toLowerCase()) ? `${rawTitle}: ${sub}` : rawTitle);
  const updates: Json[] = m['updated-by'] ?? [];
  const ret = updates.find(isRetraction);
  const when = ret?.updated?.['date-parts']?.[0] as number[] | undefined;
  const people: Json[] = m.author?.length ? m.author : (m.editor ?? []);
  return drop({
    registry: 'crossref' as const,
    id: String(m.DOI ?? '').toLowerCase(),
    doi: m.DOI ? String(m.DOI).toLowerCase() : undefined,
    title,
    authors: people.map((a): Author => drop({ family: stripTags(a.family ?? a.name ?? a.given ?? ''), given: clean(a.given) })).filter((a) => /\p{L}/u.test(a.family)),
    year: crossrefYear(m),
    container: clean(m['container-title']?.[0]),
    volume: clean(m.volume),
    issue: clean(m.issue),
    pages: clean(m.page) ?? clean(m['article-number']),
    publisher: clean(m.publisher),
    type: clean(m.type),
    url: m.DOI ? `https://doi.org/${m.DOI}` : clean(m.URL),
    abstract: clean(m.abstract)?.replace(/^abstract\s*/i, ''),
    citedBy: typeof m['is-referenced-by-count'] === 'number' ? m['is-referenced-by-count'] : undefined,
    retracted: !!ret || /^\s*(retracted( article)?|withdrawn)\s*[:.\-–]/i.test(rawTitle),
    retractedOn: when ? when.map((n, i) => (i ? String(n).padStart(2, '0') : String(n))).join('-') : undefined,
  }) as RegistryRecord;
}

/** OpenAlex stores abstracts as word positions. */
export function abstractFromIndex(ix: Record<string, number[]> | null | undefined): string | undefined {
  if (!ix) return undefined;
  const words: string[] = [];
  for (const [w, ps] of Object.entries(ix)) for (const p of ps) words[p] = w;
  return clean(words.join(' '));
}

export function fromOpenAlex(w: Json): RegistryRecord {
  const loc = w.primary_location ?? {};
  const b = w.biblio ?? {};
  const pages = b.first_page ? (b.last_page && b.last_page !== b.first_page ? `${b.first_page}-${b.last_page}` : b.first_page) : undefined;
  return drop({
    registry: 'openalex' as const,
    id: String(w.id ?? '').replace('https://openalex.org/', ''),
    openalexId: w.id ? String(w.id).replace('https://openalex.org/', '') : undefined,
    doi: w.doi ? String(w.doi).replace(/^https?:\/\/doi\.org\//i, '').toLowerCase() : undefined,
    title: stripTags(String(w.title ?? w.display_name ?? '')),
    authors: (w.authorships ?? [])
      .map((a: Json): Author => {
        const n = stripTags(String(a.author?.display_name ?? a.raw_author_name ?? ''));
        const parts = n.split(' ');
        const family = parts.pop() ?? '';
        return drop({ family, given: parts.join(' ') || undefined });
      })
      .filter((a: Author) => /\p{L}/u.test(a.family)),
    year: typeof w.publication_year === 'number' ? w.publication_year : undefined,
    container: clean(loc.source?.display_name),
    volume: clean(b.volume),
    issue: clean(b.issue),
    pages: clean(pages),
    publisher: clean(loc.source?.host_organization_name),
    type: clean(w.type_crossref ?? w.type),
    url: w.doi ?? loc.landing_page_url ?? undefined,
    abstract: abstractFromIndex(w.abstract_inverted_index),
    openAccessUrl: w.open_access?.oa_url ?? undefined,
    citedBy: typeof w.cited_by_count === 'number' ? w.cited_by_count : undefined,
    references: Array.isArray(w.referenced_works) ? w.referenced_works.map((x: string) => x.replace('https://openalex.org/', '')) : undefined,
    retracted: w.is_retracted === true,
  }) as RegistryRecord;
}

export function fromDataCite(d: Json): RegistryRecord {
  const a = d.attributes ?? {};
  return drop({
    registry: 'datacite' as const,
    id: String(a.doi ?? d.id ?? '').toLowerCase(),
    doi: a.doi ? String(a.doi).toLowerCase() : undefined,
    title: stripTags(String(a.titles?.[0]?.title ?? '')),
    authors: (a.creators ?? []).map((c: Json): Author => drop({ family: stripTags(String(c.familyName ?? c.name ?? '')), given: clean(c.givenName) })).filter((x: Author) => x.family),
    year: Number(a.publicationYear) || undefined,
    container: clean(a.container?.title) ?? clean(typeof a.publisher === 'string' ? a.publisher : a.publisher?.name),
    publisher: clean(typeof a.publisher === 'string' ? a.publisher : a.publisher?.name),
    type: clean(a.types?.resourceTypeGeneral)?.toLowerCase(),
    url: a.doi ? `https://doi.org/${a.doi}` : clean(a.url),
    abstract: clean((a.descriptions ?? []).find((x: Json) => x.descriptionType === 'Abstract')?.description),
    retracted: false,
  }) as RegistryRecord;
}
