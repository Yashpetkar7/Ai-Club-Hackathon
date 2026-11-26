// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReferenceCheck } from '@/core/contracts';
import { CORPUS_MANIFEST, FAILURE_FAMILIES, LAB_CORPUS, buildCorpus, type LabCase } from '@/core/lab/corpus';
import { registries } from '@/core/registries';
import { fromCrossref } from '@/core/registries/map';
import { cleanTitle } from '@/core/verify/normalise';
import { checkReference } from '@/core/verify/verdict';
import { installReplay } from './replay';

type Recording = Record<string, { status: number; body: { message: Record<string, unknown> & { items?: Record<string, unknown>[] } } }>;
const recording = JSON.parse(readFileSync('tests/unit/fixtures/registry.json', 'utf8')) as Recording;
const controls = LAB_CORPUS.filter((c) => c.family === 'real');
const invented = LAB_CORPUS.filter((c) => c.family !== 'real');

describe('Integrity Lab corpus contract, declared before measuring outcomes', () => {
  it('contains twelve distinct real controls, not repeated citation styles or duplicate titles', () => {
    expect(controls).toHaveLength(12);
    expect(new Set(controls.map((c) => c.reference.doi)).size).toBe(12);
    expect(new Set(controls.map((c) => c.reference.title?.toLocaleLowerCase())).size).toBe(12);
    expect(controls.every((c) => !c.invented && c.provenance.length > 0)).toBe(true);
  });

  it('keeps the predeclared size and every requested failure family', () => {
    expect(LAB_CORPUS).toHaveLength(24);
    expect(FAILURE_FAMILIES).toEqual(['total-fabrication', 'part-corrupted', 'hijacked-identifier', 'placeholder', 'plausible-missing-title']);
    expect(Object.fromEntries(FAILURE_FAMILIES.map((f) => [f, invented.filter((c) => c.family === f).length]))).toEqual({
      'total-fabrication': 2,
      'part-corrupted': 4,
      'hijacked-identifier': 2,
      placeholder: 2,
      'plausible-missing-title': 2,
    });
    expect(new Set(LAB_CORPUS.map((c) => c.id)).size).toBe(LAB_CORPUS.length);
  });

  it('generates identical cases without a clock or random selection', () => {
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('A corpus must not use the current time'); });
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('A corpus must not select random cases'); });
    try {
      expect(buildCorpus()).toEqual(LAB_CORPUS);
      expect(buildCorpus()).toEqual(buildCorpus());
    } finally {
      clock.mockRestore();
      random.mockRestore();
    }
    expect(Object.isFrozen(LAB_CORPUS)).toBe(true);
    expect(LAB_CORPUS.every((c) => Object.isFrozen(c) && Object.isFrozen(c.reference))).toBe(true);
  });

  it.each(controls)('copies the real metadata and provenance for $id from a recorded response', (c) => {
    const p = c.provenance[0]!;
    const response = recording[p.fixtureUrl];
    expect(response, p.fixtureUrl).toBeDefined();
    expect(response!.status).toBe(200);
    const raw = p.itemIndex === null ? response!.body.message : response!.body.message.items?.[p.itemIndex];
    expect(raw).toBeDefined();
    const record = fromCrossref(raw!);
    expect(c.reference).toMatchObject({
      doi: record.doi,
      title: cleanTitle(record.title),
      authors: record.authors.slice(0, 3).map((a) => a.family),
      year: record.year,
    });
    expect(p.doi).toBe(record.doi);
    expect(p.fixturePath).toBe('tests/unit/fixtures/registry.json');
    expect(c.expected).toBe(record.retracted ? 'retraction-flag' : 'metadata-match');
  });

  it('labels every generated reference as invented and records its derivation', () => {
    for (const c of invented) {
      expect(c.invented, c.id).toBe(true);
      expect(c.label, c.id).toContain('Invented');
      expect(c.expected).toBe('reject-invented');
      expect(c.mutation?.method, c.id).toBeTruthy();
      for (const baseId of c.mutation!.baseCaseIds) expect(controls.some((x) => x.id === baseId), baseId).toBe(true);
    }
    // No new DOI is fabricated, even for the deliberately invented examples.
    const realDois = new Set(controls.map((c) => c.reference.doi));
    for (const c of invented) if (c.reference.doi) expect(realDois.has(c.reference.doi), c.id).toBe(true);
  });

  it('includes wrong-author and wrong-year alterations and an expected retraction', () => {
    const partial = invented.filter((c) => c.family === 'part-corrupted');
    expect(partial.filter((c) => c.mutation?.method === 'replace-author')).toHaveLength(2);
    expect(partial.filter((c) => c.mutation?.method === 'shift-year')).toHaveLength(2);
    const retracted = controls.filter((c) => c.expected === 'retraction-flag');
    expect(retracted).toHaveLength(1);
    expect(retracted[0]!.reference.doi).toBe('10.1108/jrit-01-2024-0017');
  });

  it('states the parser boundary and preserves incomplete replay coverage', () => {
    expect(CORPUS_MANIFEST.scope).toBe('metadata-checker');
    expect(CORPUS_MANIFEST.parserIncluded).toBe(false);
    expect(CORPUS_MANIFEST.recordingIsLive).toBe(false);
    const full = controls.filter((c) => c.provenance[0]!.itemIndex === null);
    const searchOnly = controls.filter((c) => c.provenance[0]!.itemIndex !== null);
    expect(full).toHaveLength(8);
    expect(searchOnly).toHaveLength(4);
    for (const c of searchOnly) {
      expect(recording[`https://api.crossref.org/works/${c.reference.doi}`]).toBeUndefined();
    }
  });
});

describe('real metadata checker through the existing offline replay', () => {
  const nativeFetch = globalThis.fetch;
  const missingRequests = new Set<string>();
  const measured: { id: string; expected: LabCase['expected']; verdict: ReferenceCheck['verdict']; missingReplay: string[] }[] = [];

  beforeAll(() => {
    if (process.env.RECORD === '1') throw new Error('Lab tests are replay-only. Do not overwrite the shared recording.');
    installReplay();
    const replayFetch = globalThis.fetch;
    // Observe replay misses without manufacturing a registry response or hiding an error.
    globalThis.fetch = async (input, init) => {
      try {
        return await replayFetch(input, init);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('not recorded: ')) missingRequests.add(error.message.slice('not recorded: '.length));
        throw error;
      }
    };
  });

  beforeEach(() => {
    missingRequests.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());
  afterAll(() => {
    globalThis.fetch = nativeFetch;
    console.info('LAB_REPLAY_MEASUREMENT', JSON.stringify({
      scope: CORPUS_MANIFEST.scope,
      live: false,
      cases: measured.length,
      verdicts: Object.fromEntries([...new Set(measured.map((x) => x.verdict))].map((v) => [v, measured.filter((x) => x.verdict === v).length])),
      missingReplayCases: measured.filter((x) => x.missingReplay.length > 0).map((x) => x.id),
    }));
  });

  it.each(LAB_CORPUS)('records the actual offline outcome for $id without filling missing responses', async (c) => {
    const pending = checkReference(c.reference, registries);
    await vi.runAllTimersAsync();
    const check = await pending;
    measured.push({ id: c.id, expected: c.expected, verdict: check.verdict, missingReplay: [...missingRequests] });

    if (missingRequests.size) {
      // An unrecorded request is a replay coverage gap, not an observed live registry outage.
      expect(check.verdict, c.id).toBe('could-not-check');
      expect(check.reasons).toContain('REGISTRY_UNREACHABLE');
      expect(check.trace.some((t) => t.status === 'error')).toBe(true);
      return;
    }
    if (c.expected === 'metadata-match') {
      if (check.verdict === 'one-registry') {
        expect(check.reasons.some((r) => ['SECOND_REGISTRY_NO_RECORD', 'REGISTRY_METADATA_DISAGREES', 'SECOND_REGISTRY_UNREACHABLE'].includes(r))).toBe(true);
        expect(check.trace.some((t) => t.registry === 'openalex' && t.status !== 'match')).toBe(true);
      } else expect(check.verdict, c.id).toBe('confirmed');
    }
    else if (c.expected === 'retraction-flag') expect(check.verdict, c.id).toBe('retracted');
    else {
      // Retain any confirmed invented case in measured output; a miss is evaluation data.
      expect(['confirmed', 'one-registry', 'details-differ', 'wrong-paper', 'retracted', 'not-found', 'could-not-check']).toContain(check.verdict);
      if (c.mutation?.method === 'replace-author') expect(check.fields.some((f) => f.field === 'authors')).toBe(true);
      if (c.mutation?.method === 'shift-year') expect(check.fields.some((f) => f.field === 'year')).toBe(true);
      if (c.family === 'hijacked-identifier') expect(check.record?.doi).toBe(c.reference.doi);
      if (c.family === 'placeholder') {
        expect(check.verdict).toBe('not-found');
        expect(check.reasons).toContain('NOT_ENOUGH_TO_SEARCH');
        expect(check.trace).toHaveLength(0);
      }
    }
  });
});
