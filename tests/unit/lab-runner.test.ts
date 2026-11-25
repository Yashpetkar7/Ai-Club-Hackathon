// @vitest-environment node
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReferenceCheck } from '@/core/contracts';
import { LAB_CORPUS } from '@/core/lab/corpus';
import { evaluateCase, summarizeFamilies } from '@/core/lab/evaluate';
import { startLabRun, type LabRow } from '@/core/lab/runner';
import { fromCrossref, fromOpenAlex } from '@/core/registries/map';
import { checkReference, type Registries } from '@/core/verify/verdict';

const fixture = JSON.parse(readFileSync('tests/unit/fixtures/registry.json', 'utf8'));
const full = LAB_CORPUS[0]!;
const retracted = LAB_CORPUS.find((c) => c.expected === 'retraction-flag')!;
const invented = LAB_CORPUS.find((c) => c.family === 'part-corrupted')!;
const lookup = (url: string) => {
  if (!fixture[url]) throw new Error(`Unit adapter has no recorded response: ${url}`);
  return fixture[url].status === 404 ? null : fixture[url].body;
};
const recorded: Registries = {
  crossrefByDoi: async (doi) => { const j = lookup(`https://api.crossref.org/works/${doi}`); return j ? fromCrossref(j.message) : null; },
  openalexByDoi: async (doi) => {
    const url = Object.keys(fixture).find((u) => u.startsWith(`https://api.openalex.org/works/doi:${doi}?`));
    if (!url) throw new Error('Unit adapter has no secondary recording');
    const j = lookup(url); return j ? fromOpenAlex(j) : null;
  },
  dataciteByDoi: async () => { throw new Error('Not used by this unit adapter'); },
  doiExists: async () => { throw new Error('Not used by this unit adapter'); },
  crossrefSearch: async () => { throw new Error('Not used by this unit adapter'); },
};
let confirmed: ReferenceCheck;
let retraction: ReferenceCheck;
beforeAll(async () => {
  confirmed = await checkReference(full.reference, recorded);
  retraction = await checkReference(retracted.reference, recorded);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const row = (check: ReferenceCheck, c = full): LabRow => ({ case: c, state: 'completed', check });

describe('Lab runner lifecycle', () => {
  it('takes a complete immutable snapshot and reports progress through completion', async () => {
    const cases = structuredClone(LAB_CORPUS.slice(0, 2));
    const waiting = deferred<ReferenceCheck>();
    const updates: string[] = [];
    const check = vi.fn().mockImplementationOnce(() => waiting.promise).mockResolvedValue(confirmed);
    const run = startLabRun({ cases, check, onUpdate: (s) => updates.push(s.rows.map((r) => r.state).join(',')) });
    cases[1]!.reference.raw = 'The caller changed its own copy';
    expect(run.snapshot().rows.map((r) => r.state)).toEqual(['active', 'unrun']);
    expect(Object.isFrozen(run.snapshot().rows[1]!.case.reference)).toBe(true);
    waiting.resolve(confirmed);
    const done = await run.done;
    expect(done.status).toBe('completed');
    expect(done.rows.every((r) => r.state === 'completed')).toBe(true);
    expect(done.rows[1]!.case.reference.raw).toBe(LAB_CORPUS[1]!.reference.raw);
    expect(done.startedAt).toMatch(/^\d{4}-/);
    expect(done.finishedAt).toBeTruthy();
    expect(updates).toContain('completed,active');
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('cancels immediately, keeps completed results and ignores the late active result', async () => {
    const waiting = deferred<ReferenceCheck>();
    const check = vi.fn().mockResolvedValueOnce(confirmed).mockImplementationOnce(() => waiting.promise);
    const notify = vi.fn();
    const run = startLabRun({ cases: LAB_CORPUS.slice(0, 3), check, onUpdate: notify });
    await flush();
    run.cancel();
    const cancelled = await run.done;
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.rows.map((r) => r.state)).toEqual(['completed', 'cancelled', 'unrun']);
    expect(cancelled.rows[0]!.check).toEqual(confirmed);
    const calls = notify.mock.calls.length;
    waiting.resolve(confirmed);
    await flush();
    expect(notify).toHaveBeenCalledTimes(calls);
    expect(check).toHaveBeenCalledTimes(2);
    expect(run.snapshot()).toBe(cancelled);
  });

  it('does not let a cancelled run change a later independent run', async () => {
    const old = deferred<ReferenceCheck>();
    const earlier = startLabRun({ cases: [full], check: () => old.promise });
    earlier.cancel();
    const later = startLabRun({ cases: [retracted], check: async () => retraction });
    const done = await later.done;
    old.resolve(confirmed);
    await flush();
    expect(later.snapshot()).toBe(done);
    expect(done.rows[0]!.check?.verdict).toBe('retracted');
    expect(earlier.snapshot().rows[0]!.check).toBeUndefined();
  });

  it('retains an exception as an error without inventing a checker verdict', async () => {
    const check = vi.fn().mockRejectedValueOnce(new Error('Injected checker exception')).mockResolvedValueOnce(confirmed);
    const done = await startLabRun({ cases: LAB_CORPUS.slice(0, 2), check }).done;
    expect(done.rows[0]!.state).toBe('error');
    expect(done.rows[0]!.check).toBeUndefined();
    expect(done.rows[0]!.error).toBe('Injected checker exception');
    expect(done.rows[1]!.state).toBe('completed');
  });
});

describe('evaluation is separate from the actual checker verdict', () => {
  it('keeps misses and false alarms, and treats the real retraction as expected', () => {
    // These deliberately mismatched result/case pairs exercise scoring, not a reported corpus run.
    expect(evaluateCase(row(confirmed, invented)).outcome).toBe('missed');
    expect(evaluateCase(row(retraction, full)).outcome).toBe('false-alarm');
    expect(evaluateCase(row(retraction, retracted)).outcome).toBe('expected-retraction');
    expect(evaluateCase(row(confirmed, retracted)).outcome).toBe('missed');
  });

  it('keeps a real total outage unresolved', async () => {
    const down = async (): Promise<never> => { throw new Error('Injected registry outage'); };
    const check = await checkReference(full.reference, { crossrefByDoi: down, openalexByDoi: down, dataciteByDoi: down, doiExists: down, crossrefSearch: down });
    expect(check.verdict).toBe('could-not-check');
    expect(evaluateCase(row(check)).outcome).toBe('could-not-check');
  });

  it('a secondary outage is never Confirmed and never counted as a success', async () => {
    const check = await checkReference(full.reference, { ...recorded, openalexByDoi: async () => { throw new Error('Injected secondary outage'); } });
    expect(check.verdict).toBe('one-registry');
    expect(evaluateCase(row(check))).toMatchObject({ outcome: 'unresolved', reason: 'partial-registry' });
    expect(check.verdict).toBe('one-registry');
  });

  it('keeps a false acceptance visible as a miss even when the trace has an error', async () => {
    const limited = await checkReference(full.reference, { ...recorded, openalexByDoi: async () => { throw new Error('Injected secondary outage'); } });
    expect(evaluateCase(row(limited, invented))).toMatchObject({ outcome: 'missed', limitedCoverage: true });
    expect(evaluateCase(row(limited, retracted))).toMatchObject({ outcome: 'missed', limitedCoverage: true });
    expect(evaluateCase({ ...row(limited, invented), missingReplay: ['unrecorded request'] })).toMatchObject({ outcome: 'missed', limitedCoverage: true });
  });

  it('preserves a detected mismatch alongside the separate coverage limitation', async () => {
    const limited = await checkReference(invented.reference, { ...recorded, openalexByDoi: async () => { throw new Error('Injected secondary outage'); } });
    expect(limited.verdict).toBe('details-differ');
    expect(evaluateCase(row(limited, invented))).toMatchObject({ outcome: 'caught', limitedCoverage: true });
    expect(summarizeFamilies([row(limited, invented)]).find((s) => s.family === 'part-corrupted')).toMatchObject({ caught: 1, limitedCoverage: 1 });
  });

  it('never counts an unknown verdict, missing result or replay gap as success', () => {
    const unknown = { ...confirmed, verdict: 'future-status' } as unknown as ReferenceCheck;
    expect(evaluateCase(row(unknown)).outcome).toBe('unresolved');
    expect(evaluateCase({ case: full, state: 'completed' }).outcome).toBe('unresolved');
    expect(evaluateCase({ ...row(confirmed), missingReplay: ['unrecorded request'] })).toMatchObject({ outcome: 'could-not-check', reason: 'missing-replay' });
  });

  it('keeps cancelled, unrun, active and error cases out of success counts', () => {
    const states = ['cancelled', 'unrun', 'active', 'error'] as const;
    const rows = states.map((state) => ({ case: full, state }));
    for (const r of rows) expect(evaluateCase(r).outcome).toBe(r.state);
    const summary = summarizeFamilies(rows).find((s) => s.family === 'real')!;
    expect(summary.correct).toBe(0);
    expect(summary.unrun).toBe(1);
    expect(summary.cancelled).toBe(1);
    expect(summary.active).toBe(1);
    expect(summary.unresolved).toBe(1);
  });
});
