import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

/** Replays recorded registry answers in the browser, so the journey test needs no network. */
type Recorded = Record<string, { status: number; body: any }>;
const store: Recorded = JSON.parse(readFileSync('tests/unit/fixtures/registry.json', 'utf8'));

const openAlexWorks = Object.entries(store)
  .filter(([u, r]) => u.startsWith('https://api.openalex.org/works/doi:') && r.status === 200)
  .map(([, r]) => r.body);

export async function mockRegistries(page: Page): Promise<string[]> {
  const unknown: string[] = [];
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('pt-test-no-guest')) localStorage.setItem('pt-session', 'guest');
  });
  await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true, ai: true, openalexKey: false } }));
  await page.route('**/api/registry?*', (r) => {
    const url = new URL(r.request().url()).searchParams.get('url') ?? '';
    // Questions about one work's reference list, and about works by id, are not searches.
    if (url.includes('filter=cited_by:')) return r.fulfill({ json: { results: [] } });
    const ids = url.match(/filter=openalex:([W\d|]+)/)?.[1]?.split('|');
    if (ids) return r.fulfill({ json: { results: openAlexWorks.filter((w) => ids.includes(String(w.id).replace('https://openalex.org/', ''))) } });
    if (url.startsWith('https://api.openalex.org/works?')) return r.fulfill({ json: { results: openAlexWorks } });
    const hit = store[url];
    if (!hit) {
      unknown.push(url);
      return r.fulfill({ status: 503, json: { error: 'not recorded' } });
    }
    return r.fulfill({ status: hit.status, json: hit.body ?? {} });
  });
  return unknown;
}

/** Collects anything that would look broken to a judge with the console open. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|fonts\.g|Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return errors;
}
