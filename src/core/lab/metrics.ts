import { judge, type Support } from '@/core/claims/label';
import { rankSentences } from '@/core/claims/rank';
import type { ClaimLabel, ReasonCode, ReferenceCheck } from '@/core/contracts';
import { POLICY } from '@/policy/policy';
import { CLAIM_SETS, type ClaimSetId, type ClaimsEval, type EvalClaim } from './claims-data';
import { evaluateCase, type LabEvaluation, type LabOutcome } from './evaluate';
import type { LabRow } from './runner';

/**
 * How accurate the checkers are on the Lab's own labelled data. Everything here is worked out by running the real
 * judge() and the reference checker's recorded results; no number is typed in. Labels still come only from judge().
 */

/** k of n, with a Wilson 95% interval. p, lo and hi are null when there are no cases: no cases, no rate. */
export interface Rate { k: number; n: number; p: number | null; lo: number | null; hi: number | null }

export function wilson(k: number, n: number, z = 1.96): Rate {
  if (!n) return { k, n, p: null, lo: null, hi: null };
  const p = k / n;
  const z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { k, n, p, lo: k === 0 ? 0 : Math.max(0, centre - half), hi: k === n ? 1 : Math.min(1, centre + half) };
}

const f1Of = (precision: number | null, recall: number | null): number | null =>
  precision === null || recall === null || precision + recall === 0 ? null : (2 * precision * recall) / (precision + recall);

/* ------------------------------------------------------------------ claims */

export type ModelMode = 'recorded' | 'none' | 'forced-yes';
/** The stress test the claim tests use: the support model says yes to everything, so only the plain-code guards are left. */
export const FORCED_YES: Support = { entails: 0.99, contradicts: 0.001 };
export const MODES: readonly { mode: ModelMode; name: string; note: string }[] = [
  { mode: 'recorded', name: 'Recorded model scores', note: 'The support model’s real scores, recorded once in Chrome. This is how the product runs with the model on.' },
  { mode: 'none', name: 'No model', note: 'Plain code only: word for word, numbers, direction and scope.' },
  { mode: 'forced-yes', name: 'Model forced to say yes', note: 'Stress test. The model backs every claim, so only the plain-code guards can stop a false one.' },
];

/**
 * Benchmark input, not a verdict. Every claim is judged as if its source had passed the reference check, so only the
 * claim checker is measured, the same way the claim tests do. It is never stored, shown or attached to a source.
 */
const SOURCE_PASSED = Object.freeze({ verdict: 'confirmed', reasons: [], fields: [], trace: [], checkedAt: '' }) as unknown as ReferenceCheck;

export interface ClaimResult {
  set: ClaimSetId;
  gold: boolean;
  claim: string;
  doi: string;
  /** The sentence judge() was given: the closest by shared words, as in the product. */
  passage: string | null;
  /** False when the ranking now picks a different sentence from the one the score was recorded on. The score is then not used. */
  scoreFits: boolean;
  support: Support | null;
  label: ClaimLabel;
  reasons: ReasonCode[];
  wordForWord: boolean;
}

/** Runs the real pipeline on every claim: closest sentence, then judge(). */
export function judgeClaims(claims: readonly EvalClaim[], abstracts: Readonly<Record<string, string>>, mode: ModelMode): ClaimResult[] {
  return claims.map((c) => {
    const text = abstracts[c.doi] ?? '';
    const passage = rankSentences(text, c.claim)[0]?.text ?? null;
    const scoreFits = !c.score || passage === c.premise;
    const support: Support | null = mode === 'forced-yes' ? FORCED_YES : mode === 'recorded' && c.score && scoreFits ? { entails: c.score.entails, contradicts: c.score.contradicts } : null;
    const j = judge(c.claim, { text, check: SOURCE_PASSED }, passage ?? undefined, support);
    return { set: c.set, gold: c.gold, claim: c.claim, doi: c.doi, passage, scoreFits, support, label: j.label, reasons: j.reasons, wordForWord: j.wordForWord };
  });
}

export type Bucket = 'verified' | 'reported' | 'disputed' | 'other';
export const BUCKETS: readonly Bucket[] = ['verified', 'reported', 'disputed', 'other'];
const bucketOf = (l: ClaimLabel): Bucket => (l === 'verified' || l === 'reported' || l === 'disputed' ? l : 'other');
const emptyRow = (): Record<Bucket, number> => ({ verified: 0, reported: 0, disputed: 0, other: 0 });

/** Rows are the gold answer, columns the label judge() gave. */
export interface Confusion { true: Record<Bucket, number>; false: Record<Bucket, number> }

export function confusion(results: readonly Pick<ClaimResult, 'gold' | 'label'>[]): Confusion {
  const m: Confusion = { true: emptyRow(), false: emptyRow() };
  for (const r of results) m[r.gold ? 'true' : 'false'][bucketOf(r.label)]++;
  return m;
}

export interface ClaimMetrics {
  total: number;
  trueN: number;
  falseN: number;
  confusion: Confusion;
  /** The number that matters most: false claims labelled Verified. */
  falseVerified: Rate;
  falseDisputed: Rate;
  falseReported: Rate;
  /** Recall: true claims labelled Verified. */
  trueVerified: Rate;
  trueDisputed: Rate;
  /** Of every Verified label, how many were true claims. */
  precision: Rate;
  f1: number | null;
  /** Claims whose recorded score was left out because the ranking now picks another sentence. */
  unfitScores: number;
}

export function claimMetrics(results: readonly ClaimResult[]): ClaimMetrics {
  const m = confusion(results);
  const trueN = BUCKETS.reduce((a, b) => a + m.true[b], 0);
  const falseN = BUCKETS.reduce((a, b) => a + m.false[b], 0);
  const precision = wilson(m.true.verified, m.true.verified + m.false.verified);
  const trueVerified = wilson(m.true.verified, trueN);
  return {
    total: results.length, trueN, falseN, confusion: m,
    falseVerified: wilson(m.false.verified, falseN),
    falseDisputed: wilson(m.false.disputed, falseN),
    falseReported: wilson(m.false.reported, falseN),
    trueVerified,
    trueDisputed: wilson(m.true.disputed, trueN),
    precision,
    f1: f1Of(precision.p, trueVerified.p),
    unfitScores: results.filter((r) => !r.scoreFits).length,
  };
}

export interface SetCounts { set: ClaimSetId; name: string; gold: boolean; n: number; counts: Record<Bucket, number> }

export function countsBySet(results: readonly ClaimResult[]): SetCounts[] {
  return CLAIM_SETS.map((s) => {
    const rows = results.filter((r) => r.set === s.id);
    const counts = emptyRow();
    for (const r of rows) counts[bucketOf(r.label)]++;
    return { set: s.id, name: s.name, gold: s.gold, n: rows.length, counts };
  });
}

/** Worst first: a false claim passed, a true claim disputed, a false claim not caught, a true claim not confirmed. */
export type MissKind = 'false-verified' | 'true-disputed' | 'false-not-disputed' | 'true-not-verified';
export const MISS_ORDER: readonly MissKind[] = ['false-verified', 'true-disputed', 'false-not-disputed', 'true-not-verified'];
export interface ClaimMiss extends ClaimResult { kind: MissKind }

export function claimMisses(results: readonly ClaimResult[]): ClaimMiss[] {
  const kindOf = (r: ClaimResult): MissKind | null => {
    if (!r.gold) return r.label === 'verified' ? 'false-verified' : r.label === 'disputed' ? null : 'false-not-disputed';
    return r.label === 'verified' ? null : r.label === 'disputed' ? 'true-disputed' : 'true-not-verified';
  };
  return results
    .flatMap((r) => {
      const kind = kindOf(r);
      return kind ? [{ ...r, kind }] : [];
    })
    .sort((a, b) => MISS_ORDER.indexOf(a.kind) - MISS_ORDER.indexOf(b.kind));
}

/* ------------------------------------------------- the model alone, no guards */

export interface Scored { gold: boolean; entails: number; contradicts: number }
export const scoredOf = (claims: readonly EvalClaim[]): Scored[] => claims.flatMap((c) => (c.score ? [{ gold: c.gold, entails: c.score.entails, contradicts: c.score.contradicts }] : []));

export interface SweepPoint { threshold: number; tp: number; fp: number; fn: number; tn: number; precision: Rate; recall: Rate; f1: number | null }
export const SWEEP_THRESHOLDS: readonly number[] = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.97, 0.99];

/** If the model's support score alone decided Verified: support at or above the threshold. The product never does this. */
export function sweepSupport(items: readonly Scored[], thresholds: readonly number[] = SWEEP_THRESHOLDS): SweepPoint[] {
  return thresholds.map((threshold) => {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (const s of items) {
      const yes = s.entails >= threshold;
      if (yes && s.gold) tp++;
      else if (yes) fp++;
      else if (s.gold) fn++;
      else tn++;
    }
    const precision = wilson(tp, tp + fp);
    const recall = wilson(tp, tp + fn);
    return { threshold, tp, fp, fn, tn, precision, recall, f1: f1Of(precision.p, recall.p) };
  });
}

/** Area under the ROC curve for the support score: the chance a true claim scores above a false one (ties count half). */
export function rocAuc(items: readonly Scored[]): number | null {
  const pos = items.filter((s) => s.gold).map((s) => s.entails);
  const neg = items.filter((s) => !s.gold).map((s) => s.entails);
  if (!pos.length || !neg.length) return null;
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

/** Mean squared gap between the support score and the gold answer (1 true, 0 false). Lower is better. */
export function brier(items: readonly Scored[]): number | null {
  if (!items.length) return null;
  return items.reduce((a, s) => a + (s.entails - (s.gold ? 1 : 0)) ** 2, 0) / items.length;
}

/** The contradiction score alone at the policy threshold. */
export function contradictionAlone(items: readonly Scored[], threshold = POLICY.thresholds.contradiction): { threshold: number; falseFlagged: Rate; trueFlagged: Rate } {
  const f = items.filter((s) => !s.gold);
  const t = items.filter((s) => s.gold);
  return { threshold, falseFlagged: wilson(f.filter((s) => s.contradicts >= threshold).length, f.length), trueFlagged: wilson(t.filter((s) => s.contradicts >= threshold).length, t.length) };
}

/* -------------------------------------------------------- the whole benchmark */

export interface Ablation { mode: ModelMode; name: string; note: string; metrics: ClaimMetrics; bySet: SetCounts[]; results: ClaimResult[] }
export interface ClaimBenchmark {
  ablations: Ablation[];
  /** The recorded-scores run: what the product does with the model on. */
  main: Ablation;
  misses: ClaimMiss[];
  model: { scored: number; threshold: number; sweep: SweepPoint[]; auc: number | null; brier: number | null; contradiction: ReturnType<typeof contradictionAlone> };
}

export function claimBenchmark(data: ClaimsEval): ClaimBenchmark {
  const { claims, abstracts } = data.payload;
  const ablations = MODES.map(({ mode, name, note }) => {
    const results = judgeClaims(claims, abstracts, mode);
    return { mode, name, note, results, metrics: claimMetrics(results), bySet: countsBySet(results) };
  });
  const main = ablations.find((a) => a.mode === 'recorded')!;
  const scored = scoredOf(claims);
  return {
    ablations,
    main,
    misses: claimMisses(main.results),
    model: { scored: scored.length, threshold: POLICY.thresholds.supportVerified, sweep: sweepSupport(scored), auc: rocAuc(scored), brier: brier(scored), contradiction: contradictionAlone(scored) },
  };
}

/* ------------------------------------------------------- the reference checker */

const RESOLVED: readonly LabOutcome[] = ['correct', 'expected-retraction', 'caught', 'missed', 'false-alarm'];

export interface ReferenceMetrics {
  total: number;
  resolved: number;
  /** Cases with a usable answer, of every case. */
  coverage: Rate;
  /** Invented inputs flagged, of the invented inputs that got an answer. Unresolved cases are left out, never counted as caught. */
  detection: Rate;
  /** The same, counting every unresolved invented input as a miss. The floor. */
  detectionFloor: Rate;
  /** Real controls flagged when they should have matched, of the real controls that got an answer. */
  falseAlarms: Rate;
  invented: { total: number; caught: number; missed: number; unresolved: number };
  real: { total: number; matched: number; retraction: number; missedRetraction: number; falseAlarm: number; unresolved: number };
  /** Every case that is not a clean pass: misses, false alarms and everything without an answer, with its reason. */
  open: { row: LabRow; evaluation: LabEvaluation }[];
}

export function referenceMetrics(rows: readonly LabRow[]): ReferenceMetrics {
  const all = rows.map((row) => ({ row, evaluation: evaluateCase(row) }));
  const isResolved = (o: LabOutcome) => RESOLVED.includes(o);
  const inv = all.filter((x) => x.row.case.invented);
  const real = all.filter((x) => !x.row.case.invented);
  const n = (list: typeof all, o: LabOutcome) => list.filter((x) => x.evaluation.outcome === o).length;
  const caught = n(inv, 'caught');
  const missed = n(inv, 'missed');
  const realResolved = real.filter((x) => isResolved(x.evaluation.outcome)).length;
  const falseAlarm = n(real, 'false-alarm');
  const resolved = all.filter((x) => isResolved(x.evaluation.outcome)).length;
  return {
    total: rows.length,
    resolved,
    coverage: wilson(resolved, rows.length),
    detection: wilson(caught, caught + missed),
    detectionFloor: wilson(caught, inv.length),
    falseAlarms: wilson(falseAlarm, realResolved),
    invented: { total: inv.length, caught, missed, unresolved: inv.length - caught - missed },
    real: { total: real.length, matched: n(real, 'correct'), retraction: n(real, 'expected-retraction'), missedRetraction: n(real, 'missed'), falseAlarm, unresolved: real.length - realResolved },
    open: all.filter((x) => !['correct', 'expected-retraction', 'caught'].includes(x.evaluation.outcome)),
  };
}
