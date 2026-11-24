import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Replays recorded registry answers so tests run offline.
 * Refresh with:  RECORD=1 npx vitest run tests/unit/verify.test.ts
 */
let FILE = resolve('tests/unit/fixtures/registry.json');
const recording = process.env.RECORD === '1';
type Recorded = Record<string, { status: number; body: unknown }>;
const load = (f: string): Recorded => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {});
let store: Recorded = load(FILE);
let shared: Recorded = {};

const HEAVY = new Set(['reference', 'link', 'license', 'assertion', 'funder', 'indexed', 'deposited', 'content-domain', 'relation', 'alternative-id', 'abstract_inverted_index_v3', 'locations', 'concepts', 'topics', 'keywords', 'mesh', 'counts_by_year', 'sustainable_development_goals', 'grants', 'institutions', 'countries', 'raw_affiliation_strings', 'affiliations', 'affiliation', 'ORCID', 'facets', 'query', 'values', 'referenced_works', 'abstract_inverted_index', 'contributors', 'relatedIdentifiers', 'descriptions', 'subjects', 'formats', 'rightsList', 'relationships', 'xml', 'abstract']);

function slim(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(slim);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !HEAVY.has(k)).map(([k, x]) => [k, slim(x)]));
  return v;
}

const realFetch = globalThis.fetch;

/** Record and replay your own file, for example tests/unit/fixtures/lab.json, on top of the shared one. Call instead of installReplay. */
export function installReplayWith(file: string): void {
  shared = load(FILE);
  FILE = resolve(file);
  store = load(FILE);
  installReplay();
}

export function installReplay(): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('/api/') || url.includes('localhost')) return new Response('', { status: 404 });
    if (recording && !shared[url]) {
      const r = await realFetch(url, { headers: { 'user-agent': 'paper-trail-student-project/0.1' } });
      const body = r.headers.get('content-type')?.includes('json') ? slim(await r.json()) : null;
      if (r.status === 200 || r.status === 404) store[url] = { status: r.status, body };
      return new Response(JSON.stringify(body), { status: r.status, headers: { 'content-type': 'application/json' } });
    }
    const hit = store[url] ?? shared[url];
    if (!hit) throw new TypeError(`not recorded: ${url}`);
    return new Response(JSON.stringify(hit.body), { status: hit.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

export function saveReplay(): void {
  if (recording) writeFileSync(FILE, `${JSON.stringify(Object.fromEntries(Object.entries(store).sort(([a], [b]) => a.localeCompare(b))), null, 0)}\n`);
}
