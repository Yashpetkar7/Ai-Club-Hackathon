// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ReferenceCheck } from '@/core/contracts';
import { judge, type Support } from '@/core/claims/label';
import { rankSentences } from '@/core/claims/rank';
import { loadBenchmark } from '@/core/lab/benchmark';
import { loadClaimsEval } from '@/core/lab/claims-data';
import { brier, claimBenchmark, claimMetrics, FORCED_YES, judgeClaims, referenceMetrics, rocAuc, sweepSupport, wilson, type Ablation } from '@/core/lab/metrics';
import { compareRetrieval } from '@/core/lab/retrieval';
import type { LabRow } from '@/core/lab/runner';
import { loadSample } from '@/core/lab/sample';
import { ABSTRACT, FALSE_CLAIMS, TRUE_CLAIMS } from '../claims-set';
import { HOLD_FALSE, HOLD_TRUE } from '../claims-holdout-set';

const data = await loadClaimsEval();
const bench = claimBenchmark(data);
const mode = (m: Ablation['mode']) => bench.ablations.find((a) => a.mode === m)!;

describe('Wilson 95% intervals', () => {
  it('match the textbook values', () => {
    expect(wilson(0, 80).hi).toBeCloseTo(0.0458, 4);
    expect(wilson(0, 80).lo).toBe(0);
    const r = wilson(21, 24);
    expect(r.p).toBe(0.875);
    expect(r.lo).toBeCloseTo(0.690, 3);
    expect(r.hi).toBeCloseTo(0.957, 3);
    expect(wilson(8, 8)).toMatchObject({ p: 1, hi: 1 });
    expect(wilson(8, 8).lo).toBeCloseTo(0.676, 3);
  });
  it('are symmetric, stay inside 0 to 1, and give no rate for no cases', () => {
    for (const [k, n] of [[1, 3], [5, 17], [40, 41], [0, 1]] as const) {
      const a = wilson(k, n);
      const b = wilson(n - k, n);
      expect(a.lo!).toBeCloseTo(1 - b.hi!, 10);
      expect(a.lo!).toBeGreaterThanOrEqual(0);
      expect(a.hi!).toBeLessThanOrEqual(1);
      expect(a.lo!).toBeLessThanOrEqual(a.p!);
      expect(a.hi!).toBeGreaterThanOrEqual(a.p!);
    }
    expect(wilson(0, 0)).toEqual({ k: 0, n: 0, p: null, lo: null, hi: null });
  });
});

describe('every number comes from the real judge()', () => {
  const check = { verdict: 'confirmed', reasons: [], fields: [], trace: [], checkedAt: '' } as ReferenceCheck;
  // The pipeline the claim tests use, run here on the test sources themselves, not on the browser copy.
  const direct = (list: [string, string][], s: (c: string) => Support | null) => list.map(([c, t]) => judge(c, { text: t, check }, rankSentences(t, c)[0]?.text, s(c)).label);
  const recorded = Object.fromEntries(data.payload.claims.filter((c) => c.score).map((c) => [c.claim, c.score!]));
  const sets = [FALSE_CLAIMS, TRUE_CLAIMS, HOLD_FALSE, HOLD_TRUE];

  it.each([
    ['recorded', (c: string) => recorded[c] ?? null],
    ['none', () => null],
    ['forced-yes', () => FORCED_YES],
  ] as const)('labels match judge() on the test sets: %s', (m, s) => {
    expect(mode(m).results.map((r) => r.label)).toEqual(sets.flatMap((l) => direct(l, s)));
  });

  it('uses each recorded score only on the sentence it was recorded for', () => {
    const moved = data.payload.claims.map((c, i) => (i === 0 ? { ...c, premise: 'A different sentence.' } : c));
    const r = judgeClaims(moved, data.payload.abstracts, 'recorded');
    expect(r[0]).toMatchObject({ scoreFits: false, support: null });
    expect(claimMetrics(r).unfitScores).toBe(1);
    expect(mode('recorded').metrics.unfitScores).toBe(0);
  });

  it('every abstract in the copy is the real one from the fixture', () => {
    expect(data.payload.abstracts).toEqual(ABSTRACT);
  });
});

describe('the numbers agree with each other', () => {
  it.each(['recorded', 'none', 'forced-yes'] as const)('%s', (m) => {
    const a = mode(m).metrics;
    const c = a.confusion;
    const sum = (row: typeof c.true) => row.verified + row.reported + row.disputed + row.other;
    expect(sum(c.true)).toBe(a.trueN);
    expect(sum(c.false)).toBe(a.falseN);
    expect(a.trueN + a.falseN).toBe(a.total);
    expect(a.falseVerified).toEqual(wilson(c.false.verified, a.falseN));
    expect(a.trueVerified).toEqual(wilson(c.true.verified, a.trueN));
    expect(a.precision).toEqual(wilson(c.true.verified, c.true.verified + c.false.verified));
    expect(a.falseDisputed.k + a.falseReported.k + a.falseVerified.k + c.false.other).toBe(a.falseN);
    const p = a.precision.p!;
    const r = a.trueVerified.p!;
    expect(a.f1).toBeCloseTo((2 * p * r) / (p + r), 12);
    const bySet = mode(m).bySet;
    expect(bySet.reduce((s, x) => s + x.n, 0)).toBe(a.total);
    expect(bySet.filter((x) => x.gold).reduce((s, x) => s + x.counts.verified, 0)).toBe(c.true.verified);
  });

  it('the sweep keeps every claim at every threshold, and recall never rises as the line goes up', () => {
    const pts = bench.model.sweep;
    for (const p of pts) {
      expect(p.tp + p.fn).toBe(24);
      expect(p.fp + p.tn).toBe(80);
    }
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i]!.recall.p!).toBeLessThanOrEqual(pts[i - 1]!.recall.p!);
      expect(pts[i]!.fp).toBeLessThanOrEqual(pts[i - 1]!.fp);
    }
  });

  it('the miss list is exactly the claims without the right label', () => {
    const c = mode('recorded').metrics.confusion;
    expect(bench.misses).toHaveLength(c.false.verified + c.false.reported + c.false.other + c.true.reported + c.true.disputed + c.true.other);
    expect(bench.misses.every((m) => (m.gold ? m.label !== 'verified' : m.label !== 'disputed'))).toBe(true);
  });
});

describe('AUC and Brier on cases with a known answer', () => {
  const s = (gold: boolean, entails: number) => ({ gold, entails, contradicts: 0 });
  it('AUC', () => {
    expect(rocAuc([s(true, 0.9), s(false, 0.1)])).toBe(1);
    expect(rocAuc([s(true, 0.1), s(false, 0.9)])).toBe(0);
    expect(rocAuc([s(true, 0.5), s(false, 0.5)])).toBe(0.5);
    expect(rocAuc([s(true, 0.5)])).toBeNull();
  });
  it('Brier', () => {
    expect(brier([s(true, 1), s(false, 0)])).toBe(0);
    expect(brier([s(true, 0), s(false, 1)])).toBe(1);
    expect(brier([s(true, 0.5)])).toBe(0.25);
    expect(brier([])).toBeNull();
  });
  it('sweep at a single line', () => {
    const [p] = sweepSupport([s(true, 0.95), s(true, 0.5), s(false, 0.92), s(false, 0.1)], [0.9]);
    expect(p).toMatchObject({ tp: 1, fp: 1, fn: 1, tn: 1 });
    expect(p!.precision.p).toBe(0.5);
  });
});

// Measured on 26 November 2026 with the claim code at this commit and the scores recorded on 25 November 2026.
// If a rule change moves one of these, the change must be deliberate and the pinned value updated with a reason.
describe('regression facts, as measured', () => {
  it('no false claim is Verified, with the model, without it, or with it forced to say yes', () => {
    for (const m of ['recorded', 'none', 'forced-yes'] as const) expect(mode(m).metrics.falseVerified).toMatchObject({ k: 0, n: 80 });
    expect(bench.misses.filter((m) => m.kind === 'false-verified' || m.kind === 'true-disputed')).toEqual([]);
  });
  it('with the recorded model scores', () => {
    expect(mode('recorded').metrics.confusion).toEqual({ true: { verified: 21, reported: 3, disputed: 0, other: 0 }, false: { verified: 0, reported: 8, disputed: 72, other: 0 } });
    expect(mode('recorded').bySet.map((s) => [s.set, s.counts.verified, s.counts.reported, s.counts.disputed])).toEqual([
      ['FALSE_CLAIMS', 0, 5, 37], ['TRUE_CLAIMS', 12, 2, 0], ['HOLD_FALSE', 0, 3, 35], ['HOLD_TRUE', 9, 1, 0],
    ]);
  });
  it('without the model, and with it forced to say yes', () => {
    expect(mode('none').metrics.confusion).toEqual({ true: { verified: 16, reported: 8, disputed: 0, other: 0 }, false: { verified: 0, reported: 26, disputed: 54, other: 0 } });
    expect(mode('forced-yes').metrics.confusion).toEqual({ true: { verified: 23, reported: 1, disputed: 0, other: 0 }, false: { verified: 0, reported: 26, disputed: 54, other: 0 } });
  });
  it('the model alone', () => {
    const at = (t: number) => bench.model.sweep.find((p) => p.threshold === t)!;
    expect([at(0.9).tp, at(0.9).fp]).toEqual([21, 4]);
    expect([at(0.95).tp, at(0.95).fp]).toEqual([19, 1]);
    expect([at(0.99).tp, at(0.99).fp]).toEqual([10, 0]);
    expect(bench.model.auc).toBeCloseTo(0.9865, 4);
    expect(bench.model.brier).toBeCloseTo(0.0558, 4);
    expect(bench.model.contradiction.falseFlagged).toMatchObject({ k: 64, n: 80 });
    expect(bench.model.contradiction.trueFlagged).toMatchObject({ k: 0, n: 24 });
  });
  it('the misses: 8 false claims only Reported (all scope words), 3 true claims not confirmed', () => {
    expect(bench.misses.map((m) => m.kind)).toEqual([...Array(8).fill('false-not-disputed'), ...Array(3).fill('true-not-verified')]);
    expect(bench.misses.filter((m) => !m.gold).every((m) => m.reasons.includes('SCOPE_OVERCLAIM'))).toBe(true);
  });
});

describe('reference checker, from the recorded Lab run', () => {
  it('as measured: unresolved cases are left out, never caught', async () => {
    const r = referenceMetrics((await loadSample()).payload.run.rows);
    expect(r.detection).toMatchObject({ k: 8, n: 8 });
    expect(r.detectionFloor).toMatchObject({ k: 8, n: 12 });
    expect(r.falseAlarms).toMatchObject({ k: 0, n: 7 });
    expect(r.coverage).toMatchObject({ k: 15, n: 24 });
    expect(r.invented).toEqual({ total: 12, caught: 8, missed: 0, unresolved: 4 });
    expect(r.real).toEqual({ total: 12, matched: 6, retraction: 1, missedRetraction: 0, falseAlarm: 0, unresolved: 5 });
    expect(r.open).toHaveLength(9);
    expect(r.open.every((o) => !['correct', 'expected-retraction', 'caught'].includes(o.evaluation.outcome))).toBe(true);
  });

  it('a case that errors or was not run drops out of the rates; an accepted invention is a miss', async () => {
    const rows = (await loadSample()).payload.run.rows;
    const caught = rows.findIndex((r) => r.case.invented && r.check && !['confirmed', 'one-registry', 'could-not-check'].includes(r.check.verdict) && !r.missingReplay?.length);
    const real = rows.find((r) => !r.case.invented && r.check?.verdict === 'confirmed' && !r.missingReplay?.length)!;
    const errored: LabRow[] = rows.map((r, i) => (i === caught ? { case: r.case, state: 'error', error: 'stopped' } : r));
    const e = referenceMetrics(errored);
    expect(e.detection).toMatchObject({ k: 7, n: 7 });
    expect(e.coverage.k).toBe(14);
    const accepted: LabRow[] = rows.map((r, i) => (i === caught ? { ...r, check: real.check! } : r));
    const a = referenceMetrics(accepted);
    expect(a.detection).toMatchObject({ k: 7, n: 8 });
    expect(a.open.some((o) => o.evaluation.outcome === 'missed')).toBe(true);
    expect(referenceMetrics(rows.map((r) => ({ case: r.case, state: 'unrun' })))).toMatchObject({ resolved: 0, detection: { n: 0, p: null } });
  });
});

describe('words against meaning (FAKE embedder and FAKE support scores, made up for this test)', () => {
  const text = 'Staff productivity was measured every week. The office was painted blue in spring. Output per worker rose by a tenth.';
  const claim = 'Staff productivity rose';
  // Vectors on two made-up axes: going up, and everything else.
  const embed = async (texts: string[]) => texts.map((x) => (/rose|went up/i.test(x) ? [1, 0] : [0, 1]));
  const score = async (premise: string) => ({ entails: /rose by a tenth/.test(premise) ? 0.95 : 0.02, contradicts: 0.01 });

  it('counts a hit only at or above the line, for each way of picking', async () => {
    const r = (await compareRetrieval([{ claim, text }], { embed, score }))!;
    const row = r.rows[0]!;
    expect(r.n).toBe(1);
    expect(row.words.picked[0]!.text).toBe('Staff productivity was measured every week.');
    expect(row.meaning.picked[0]!.text).toBe('Output per worker rose by a tenth.');
    expect([row.words.top1, row.meaning.top1]).toEqual([false, true]);
    for (const m of [row.words, row.meaning]) expect(m.top3).toBe(m.picked.slice(0, 3).some((p) => (p.entails ?? 0) >= 0.9));
    expect([r.words.top1.k, r.meaning.top1.k]).toEqual([0, 1]);
    const strict = (await compareRetrieval([{ claim, text }], { embed, score, threshold: 0.99 }))!;
    expect([strict.words.top3.k, strict.meaning.top3.k]).toEqual([0, 0]);
  });

  it('a sentence the model could not score is never a hit, and a stopped run returns nothing', async () => {
    const r = (await compareRetrieval([{ claim, text }], { embed, score: async () => null }))!;
    expect(r.meaning.top3.k).toBe(0);
    expect(r.unscored).toBeGreaterThan(0);
    let calls = 0;
    expect(await compareRetrieval([{ claim, text }, { claim: 'Output rose', text }], { embed, score, stopped: () => calls++ > 0 })).toBeNull();
  });
});

it('the browser loader checks both files and works everything out', async () => {
  const b = await loadBenchmark();
  expect(b.claims.main.metrics.total).toBe(104);
  expect(b.references.total).toBe(24);
  expect(b.ms).toBeGreaterThanOrEqual(0);
});
