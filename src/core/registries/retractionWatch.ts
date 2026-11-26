import type { Notice } from '@/core/contracts';

/**
 * The Retraction Watch database (made public by Crossref), shipped with the site as a DOI index.
 * Built by scripts/build-retraction-index.mjs. A third witness next to Crossref and OpenAlex: it can add a
 * retraction or an expression of concern, with the reasons Retraction Watch recorded. It never removes one.
 */
export interface RwEntry {
  status: 'retracted' | 'concern';
  /** Date of the notice that decided the status, YYYY-MM-DD. */
  on?: string;
  /** DOI of that notice. */
  notice?: string;
  reasons: string[];
}

export interface RwMeta {
  source: string;
  url: string;
  csvSha256: string;
  csvRows: number;
  latestNotice: string;
  counts: { retracted: number; concern: number; reinstated: number; correctionOnly: number; dois: number; skippedNoDoi: number };
  reasons: string[];
}

type Shard = Record<string, [string, string, string, number[]]>;
type Fetcher = (path: string) => Promise<unknown>;

const BASE = `${(import.meta as any).env?.BASE_URL ?? '/'}data/retraction-watch/`;

const fetchJson: Fetcher = async (path) => {
  const r = await fetch(BASE + path, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`index ${r.status}`);
  return r.json();
};

/** Same normalisation and hash as the build script: lower case, no resolver, first byte of SHA-256. */
export const normDoi = (d: string): string => d.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '');
export async function shardOf(doi: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(doi));
  return [...new Uint8Array(buf).slice(0, 1)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** One reader per site. Shards and meta are cached for the page's life; a failed fetch is not cached. */
export function makeRetractionWatch(get: Fetcher = fetchJson) {
  let meta: Promise<RwMeta> | null = null;
  const shards = new Map<string, Promise<Shard>>();
  const loadMeta = (): Promise<RwMeta> => {
    meta ??= (get('meta.json') as Promise<RwMeta>).catch((e) => {
      meta = null;
      throw e;
    });
    return meta;
  };
  const loadShard = (s: string): Promise<Shard> => {
    if (!shards.has(s))
      shards.set(
        s,
        (get(`${s}.json`) as Promise<Shard>).catch((e) => {
          shards.delete(s);
          throw e;
        }),
      );
    return shards.get(s)!;
  };
  return {
    meta: loadMeta,
    /** null means the index answered and has no notice for this DOI. Throws when the index cannot be read. */
    async lookup(doi: string): Promise<RwEntry | null> {
      const d = normDoi(doi);
      const [m, shard] = await Promise.all([loadMeta(), shardOf(d).then(loadShard)]);
      const row = shard[d];
      if (!row) return null;
      const [status, on, notice, reasons] = row;
      return {
        status: status === 'R' ? 'retracted' : 'concern',
        ...(on ? { on } : {}),
        ...(notice ? { notice } : {}),
        reasons: reasons.map((i) => m.reasons[i]).filter((x): x is string => !!x),
      };
    },
  };
}

let source: Fetcher = fetchJson;
/** Tests read the shipped index from disk instead of over HTTP. The site never calls this. */
export function readRetractionWatchFrom(get: Fetcher): void {
  source = get;
}

export const retractionWatch = makeRetractionWatch((path) => source(path));

/** The notice to show for an index entry, in the same shape Crossref notices use. */
export const rwNotice = (e: RwEntry): Notice => ({
  kind: e.status === 'retracted' ? 'retraction' : 'concern',
  label: e.status === 'retracted' ? 'Retraction' : 'Expression of concern',
  by: 'retraction-watch',
  ...(e.on ? { on: e.on } : {}),
  ...(e.notice ? { doi: e.notice } : {}),
  ...(e.reasons.length ? { reasons: e.reasons } : {}),
});
