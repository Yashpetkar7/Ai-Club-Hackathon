// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkFound, discover, fuse, FOUND_BY, MEANING_MAX, meaningUrl, OA_FIELDS, openalexByMeaning, parseWorks, relatedTo, relatedUrl, RRF_K, troubleOf, whyItAppears, type Found } from '@/core/discover';
import { getJson, RegistryError, resetClosed, withFreshAnswers } from '@/core/registries/http';
import { searchPapers } from '@/core/registries';

/** Real OpenAlex and Crossref answers, recorded on 2026-11-26 without a key or email (see `about` in the file). */
const { answers } = JSON.parse(readFileSync('tests/unit/fixtures/discover.json', 'utf8')) as { answers: Record<string, { status: number; body: any }> };
const Q = 'does remote work change productivity';
const urlOf = (part: string): string => Object.keys(answers).find((u) => u.includes(part))!;
const MEANING = urlOf('search.semantic=does%20remote%20work%20change%20productivity&per-page=10');
const WORDS = urlOf('search=does%20remote%20work%20change%20productivity');
const RELATED = urlOf('related_to:W4289449379');
const RETRACTED = urlOf('is_retracted:true&per-page=3');
const TOO_MANY = urlOf('per-page=100');
const body = (u: string) => answers[u]!.body;

let calls: string[] = [];
beforeEach(() => {
  calls = [];
  resetClosed();
});
afterEach(() => vi.restoreAllMocks());

/** Serves the recorded answers by address. Anything not recorded fails loudly. No server, so calls go direct; withFreshAnswers skips the in-memory cache. */
const replay = (override: (url: string) => Response | undefined = () => undefined) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => {
    const url = String(u);
    if (url.startsWith('/api/')) return new Response('', { status: 404 });
    calls.push(url);
    const o = override(url);
    if (o) return o;
    const hit = answers[url];
    if (!hit) throw new TypeError(`not recorded: ${url}`);
    return Response.json(hit.body, { status: hit.status });
  });

describe('reading OpenAlex answers', () => {
  it('reads a real search by meaning: ten works in OpenAlex order, with year, venue, open access and DOI when there is one', () => {
    const found = parseWorks(body(MEANING));
    expect(found).toHaveLength(10);
    const first = found[0]!;
    expect(first.record.openalexId).toBe('W4289449379');
    expect(first.record.doi).toBe('10.1086/721803');
    expect(first.record.year).toBe(2022);
    expect(first.record.container).toBe('Journal of Political Economy Microeconomics');
    expect(first.openAccess).toBe(true);
    expect(first.record.abstract?.length).toBeGreaterThan(200);
    // OpenAlex holds works without a DOI too. They stay on the list, marked, with nothing filled in.
    const noDoi = found.find((f) => f.record.openalexId === 'W3195263816')!;
    expect(noDoi.record.doi).toBeUndefined();
    expect(found.find((f) => f.record.openalexId === 'W4313891292')!.openAccess).toBe(false);
  });

  it('keeps the retraction flag OpenAlex gives', () => {
    const found = parseWorks(body(RETRACTED));
    expect(found.map((f) => [f.record.openalexId, f.record.retracted])).toEqual([
      ['W4321793052', true],
      ['W4416799286', true],
    ]);
  });

  it('asks exactly what was recorded, never more than OpenAlex allows, and only filters OpenAlex accepts with meaning', () => {
    expect(meaningUrl(Q)).toBe(MEANING);
    expect(answers[TOO_MANY]).toMatchObject({ status: 400, body: { message: expect.stringContaining('cannot exceed 50') } });
    expect(meaningUrl(Q, { perPage: 100 })).toContain(`per-page=${MEANING_MAX}&`);
    const since = meaningUrl(Q, { fromYear: 2015, openAccessOnly: true });
    expect(since).toContain('&filter=publication_year:>2014,is_oa:true&');
    expect(since).not.toMatch(/has_doi|from_publication_date/);
    expect(relatedUrl('W4289449379')).toBe(RELATED);
    expect(MEANING.endsWith(`select=${OA_FIELDS}`)).toBe(true);
    // The field list is a copy of the registry client's, so a work reads the same on Find and here.
    expect(readFileSync('src/core/registries/index.ts', 'utf8')).toContain(`const OA_FIELDS = '${OA_FIELDS}';`);
  });
});

describe('asking OpenAlex through the shared lane', () => {
  it('searches by meaning, and asks nothing for an empty question', async () => {
    replay();
    expect(await openalexByMeaning('   ')).toEqual([]);
    expect(calls).toEqual([]);
    const found = await withFreshAnswers(() => openalexByMeaning(Q));
    expect(calls).toEqual([MEANING]);
    expect(found.map((f) => f.record.openalexId)).toEqual(parseWorks(body(MEANING)).map((f) => f.record.openalexId));
  });

  it('lists related works in one request, and asks nothing for an id that is not an OpenAlex work', async () => {
    replay();
    expect(await relatedTo('10.1086/721803')).toEqual([]);
    expect(calls).toEqual([]);
    const found = await withFreshAnswers(() => relatedTo('https://openalex.org/W4289449379'));
    expect(calls).toEqual([RELATED]);
    expect(found).toHaveLength(10);
    expect(found.map((f) => f.record.openalexId)).not.toContain('W4289449379');
    expect(found[0]!.record.doi).toBe('10.1111/ecin.13056');
    // OpenAlex lists some works with no year. That is said on the page, never guessed.
    expect(found.find((f) => f.record.openalexId === 'W7112926293')!.record.year).toBeUndefined();
  });

  it('a search by meaning out of daily budget stops asking at once, and never closes the free DOI lookups', async () => {
    replay((u) => (u.includes('search.semantic=') ? new Response('{}', { status: 429, headers: { 'retry-after': '10391' } }) : u.includes('/works/doi:') ? Response.json({ id: 'W1' }) : undefined));
    await expect(openalexByMeaning('a question nobody recorded')).rejects.toThrow(/daily limit/);
    await expect(openalexByMeaning('another question nobody recorded')).rejects.toThrow(/daily limit/);
    expect(calls.filter((u) => u.includes('search.semantic='))).toHaveLength(1);
    expect(await getJson('https://api.openalex.org/works/doi:10.1/zz', 'openalex')).toEqual({ id: 'W1' });
    expect(troubleOf(new RegistryError('its free daily limit is used up'), true)).toBe('limit');
    expect(troubleOf(new RegistryError('network error'), false)).toBe('offline');
    expect(troubleOf(new RegistryError('HTTP 503'), true)).toBe('no-answer');
  });
});

describe('merging words and meaning', () => {
  const meaning = () => parseWorks(body(MEANING));

  it('fuses the real searches by reciprocal rank, and says how each work was found', async () => {
    replay();
    const words = (await withFreshAnswers(() => searchPapers(Q, { perPage: 10 }))).records.map((record) => ({ record, openAccess: !!record.openAccessUrl }));
    expect(calls).toEqual([WORDS]);
    const out = fuse(words, meaning());
    expect(out).toHaveLength(19);
    expect(out.filter((h) => h.foundBy === 'both').map((h) => h.record.doi)).toEqual(['10.1111/jems.12616']);
    expect(out.filter((h) => h.foundBy === 'words')).toHaveLength(9);
    expect(out.filter((h) => h.foundBy === 'meaning')).toHaveLength(9);
    // In both lists (6th by words, 3rd by meaning) beats first place in only one.
    const top = out[0]!;
    expect(top).toMatchObject({ foundBy: 'both', wordsRank: 6, meaningRank: 3 });
    expect(top.score).toBeCloseTo(1 / (RRF_K + 6) + 1 / (RRF_K + 3), 12);
    // Equal scores keep their arrival order, words first.
    expect(out.slice(1, 3).map((h) => [h.foundBy, h.wordsRank ?? h.meaningRank])).toEqual([
      ['words', 1],
      ['meaning', 1],
    ]);
    expect(whyItAppears(top)).toBe(`Place 6 in the search by words and place 3 in the search by meaning. Score 1/(60+6) + 1/(60+3) = ${top.score.toFixed(4)}.`);
    expect(FOUND_BY[top.foundBy]).toBe('Found by words and by meaning');
    for (let i = 1; i < out.length; i++) expect(out[i - 1]!.score).toBeGreaterThanOrEqual(out[i]!.score);
  });

  it('recognises the same work by DOI first, then by OpenAlex id, and counts a repeat in one list once', () => {
    const [a, b] = meaning() as [Found, Found];
    // The same DOI from Crossref (the keyword search's fallback) and from OpenAlex is one work.
    const fromCrossref: Found = { record: { ...a.record, registry: 'crossref', id: a.record.doi!, openalexId: undefined } as never, openAccess: false };
    // The same OpenAlex id without a DOI is one work too.
    const { doi: _drop, ...bare } = b.record;
    const sameIdNoDoi: Found = { record: { ...bare, retracted: true }, openAccess: false };
    const out = fuse([fromCrossref, b, b], [a, sameIdNoDoi]);
    expect(out).toHaveLength(2);
    const first = out.find((h) => h.record.doi === a.record.doi)!;
    expect(first).toMatchObject({ foundBy: 'both', wordsRank: 1, meaningRank: 1, openAccess: true });
    expect(first.record.openalexId).toBe('W4289449379');
    const second = out.find((h) => h.record.doi === b.record.doi)!;
    expect(second).toMatchObject({ foundBy: 'both', wordsRank: 2, meaningRank: 2 });
    expect(second.score).toBeCloseTo(1 / 62 + 1 / 62, 12);
    // A retraction from either list is never lost in the merge.
    expect(second.record.retracted).toBe(true);
  });
});

describe('both searches at once', () => {
  const meaningOnly = async () => parseWorks(body(MEANING));

  it('one search failing still gives the other, with the reason said', async () => {
    const d = await discover(Q, {}, { byWords: () => Promise.reject(new RegistryError('its free daily limit is used up')), byMeaning: meaningOnly });
    expect(d.words).toEqual({ count: 0, trouble: 'limit' });
    expect(d.meaning).toEqual({ count: 10 });
    expect(d.hits.every((h) => h.foundBy === 'meaning')).toBe(true);
  });

  it('both failing is an error, never "nothing found"', async () => {
    await expect(discover(Q, {}, { byWords: () => Promise.reject(new RegistryError('HTTP 503')), byMeaning: () => Promise.reject(new RegistryError('HTTP 503')) })).rejects.toThrow('HTTP 503');
  });

  it('runs the real keyword search and the search by meaning, and passes the plan year to both', async () => {
    replay();
    const d = await withFreshAnswers(() => discover(Q));
    expect(calls.sort()).toEqual([MEANING, WORDS].sort());
    expect(d.hits).toHaveLength(19);
    expect(d.words).toEqual({ count: 10 });
    const seen: unknown[] = [];
    await discover(Q, { fromYear: 2015 }, { byWords: async (_q, o) => (seen.push(o), { records: [] }), byMeaning: async (_q, o) => (seen.push(o), []) });
    expect(seen).toEqual([{ fromYear: 2015 }, { fromYear: 2015 }]);
  });
});

describe('adding a work goes through the checker', () => {
  it('checks a found work exactly as Find does, on real recorded registry answers', async () => {
    replay();
    const found = parseWorks(body(MEANING))[0]!;
    const check = await withFreshAnswers(() => checkFound(found.record));
    expect(calls).toEqual(['https://api.crossref.org/works/10.1086/721803', `https://api.openalex.org/works/doi:10.1086/721803?select=${OA_FIELDS}`]);
    expect(check.verdict).toBe('confirmed');
    expect(check.record?.openalexId).toBe('W4289449379');
    // The abstract OpenAlex gave stays with the checked record, as Find keeps it.
    expect(check.record?.abstract).toBe(found.record.abstract);
  });
});
