import { VERDICT_TEXT, type Verdict } from '@/core/contracts';
import { FAILURE_FAMILIES, type LabFamily } from './corpus';
import type { LabRow } from './runner';

export const FAMILY_LABELS: Record<LabFamily, string> = {
  real: 'Real controls',
  'total-fabrication': 'Total fabrication',
  'part-corrupted': 'Part-corrupted',
  'hijacked-identifier': 'Hijacked identifier',
  placeholder: 'Placeholder',
  'plausible-missing-title': 'Plausible missing title',
};
export type LabOutcome = 'correct' | 'expected-retraction' | 'caught' | 'missed' | 'false-alarm' | 'could-not-check' | 'unresolved' | 'unrun' | 'active' | 'cancelled' | 'error';
export interface LabEvaluation {
  outcome: LabOutcome;
  /** Separate from the detection outcome; these cases are not fully covered checks. */
  limitedCoverage: boolean;
  reason?: 'missing-replay' | 'partial-registry' | 'unknown-verdict' | 'missing-result';
  text: string;
}

export const isKnownVerdict = (value: unknown): value is Verdict => typeof value === 'string' && Object.hasOwn(VERDICT_TEXT, value);

/** An evaluation of this frozen exercise, separate from and never replacing its checker response. */
export function evaluateCase(row: LabRow): LabEvaluation {
  const limitedCoverage = !!row.missingReplay?.length || !!row.check?.trace.some((t) => t.status === 'error');
  const result = (outcome: LabOutcome, text: string, reason?: LabEvaluation['reason']): LabEvaluation => ({ outcome, text, limitedCoverage, ...(reason ? { reason } : {}) });
  if (row.state !== 'completed') {
    const text = { unrun: 'Not run', active: 'Checking', cancelled: 'Cancelled; late results ignored', error: 'Checker error; no verdict returned' }[row.state];
    return result(row.state, text);
  }
  const check = row.check;
  if (!check) return result('unresolved', 'No checker result; unresolved', 'missing-result');
  if (!isKnownVerdict(check.verdict)) return result('unresolved', 'Unrecognised checker result; unresolved', 'unknown-verdict');

  // A false acceptance remains a miss even when another lookup failed. Coverage must not hide it.
  if (check.verdict === 'confirmed' && row.case.expected !== 'metadata-match') {
    return result('missed', row.case.expected === 'retraction-flag' ? 'Missed the known retraction' : 'Missed: invented reference was confirmed', limitedCoverage ? (row.missingReplay?.length ? 'missing-replay' : 'partial-registry') : undefined);
  }
  if (row.missingReplay?.length) return result('could-not-check', 'Missing replay coverage; unresolved', 'missing-replay');
  if (check.verdict === 'could-not-check') return result('could-not-check', 'Could not check; unresolved');
  if (!['confirmed', 'details-differ', 'wrong-paper', 'retracted', 'not-found'].includes(check.verdict)) return result('unresolved', 'Unscored checker result; unresolved', 'unknown-verdict');

  if (row.case.expected === 'retraction-flag') {
    if (check.verdict === 'retracted') return result('expected-retraction', 'Expected retraction found');
    return result('false-alarm', 'Unexpected flag on a real control; inspect the recorded expectation');
  }
  if (row.case.expected === 'metadata-match') {
    if (check.verdict === 'confirmed' && limitedCoverage) return result('unresolved', 'Incomplete registry coverage; not counted as a successful test', 'partial-registry');
    if (check.verdict === 'confirmed') return result('correct', 'Real control matched');
    return result('false-alarm', 'False alarm against the frozen expectation; inspect current metadata');
  }
  return result('caught', 'Flagged the invented input; inspect the reason');
}

export interface FamilySummary {
  family: LabFamily;
  label: string;
  total: number;
  correct: number;
  retraction: number;
  caught: number;
  missed: number;
  falseAlarm: number;
  couldNotCheck: number;
  unresolved: number;
  limitedCoverage: number;
  active: number;
  cancelled: number;
  unrun: number;
}

export function summarizeFamilies(rows: readonly LabRow[]): FamilySummary[] {
  return (['real', ...FAILURE_FAMILIES] as const).map((family) => {
    const items = rows.filter((r) => r.case.family === family);
    const outcomes = items.map((r) => evaluateCase(r).outcome);
    const n = (outcome: LabOutcome) => outcomes.filter((o) => o === outcome).length;
    return {
      family, label: FAMILY_LABELS[family], total: items.length,
      correct: n('correct'), retraction: n('expected-retraction'), caught: n('caught'), missed: n('missed'), falseAlarm: n('false-alarm'),
      couldNotCheck: n('could-not-check'), unresolved: n('unresolved') + n('error'), active: n('active'), cancelled: n('cancelled'), unrun: n('unrun'),
      limitedCoverage: items.filter((r) => evaluateCase(r).limitedCoverage).length,
    };
  });
}
