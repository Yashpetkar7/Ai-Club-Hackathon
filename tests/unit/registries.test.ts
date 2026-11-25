// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getJson, RegistryError, resetClosed } from '@/core/registries/http';
import { searchPapers } from '@/core/registries';

const item = { DOI: '10.1/a', title: ['A real paper about work'], author: [{ family: 'Noy' }], issued: { 'date-parts': [[2023]] }, abstract: '<p>Text.</p>' };
let calls: string[] = [];
beforeEach(() => {
  calls = [];
  resetClosed();
});
afterEach(() => vi.restoreAllMocks());

const net = (answer: (url: string) => Response) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => {
    const url = String(u);
    if (url.startsWith('/api/')) return new Response('', { status: 404 });
    calls.push(url);
    return answer(url);
  });

it('OpenAlex out of daily budget: one try, then Crossref at once, then no more tries', async () => {
  net((u) => (u.includes('openalex') ? new Response('{}', { status: 429, headers: { 'retry-after': '10391' } }) : Response.json({ message: { items: [item, { ...item, DOI: '10.1/b' }, { ...item, DOI: '10.1/c' }, { ...item, DOI: '10.1/d' }] } })));
  const t0 = Date.now();
  const a = await searchPapers('remote work');
  expect(a.registry).toBe('crossref');
  expect(a.note).toContain('daily limit');
  expect(calls.filter((u) => u.includes('openalex'))).toHaveLength(1);
  expect(calls.find((u) => u.startsWith('https://api.crossref.org'))).toContain('has-abstract:true');
  await searchPapers('another topic');
  expect(calls.filter((u) => u.includes('openalex'))).toHaveLength(1);
  expect(Date.now() - t0).toBeLessThan(6000);
});

it('a closed search never closes DOI lookups, which stay free', async () => {
  net((u) => (u.includes('search=') ? new Response('{}', { status: 429, headers: { 'retry-after': '10391' } }) : u.includes('openalex') ? Response.json({ id: 'W1' }) : Response.json({ message: { items: [item] } })));
  await searchPapers('a third topic');
  expect(await getJson('https://api.openalex.org/works/doi:10.1/zz', 'openalex')).toEqual({ id: 'W1' });
});

it('both registries down is an error, not an empty result', async () => {
  net(() => new Response('', { status: 400 }));
  await expect(searchPapers('a fourth topic')).rejects.toBeInstanceOf(RegistryError);
});
