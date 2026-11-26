import { immutable } from './runner';
import { digest } from './sample';

/**
 * The claim sets from tests/claims-set.ts and tests/claims-holdout-set.ts, with the real abstracts and the support
 * model's recorded scores, copied so the browser can read them. tests/unit/lab-claims-eval.test.ts builds the copy
 * from those files and fails when it drifts. The claims were written by the team; the abstracts are real.
 */
export type ClaimSetId = 'FALSE_CLAIMS' | 'TRUE_CLAIMS' | 'HOLD_FALSE' | 'HOLD_TRUE';
export interface ClaimSetInfo { id: ClaimSetId; gold: boolean; group: 'first' | 'holdout'; file: string; name: string }

export const CLAIM_SETS: readonly ClaimSetInfo[] = [
  { id: 'FALSE_CLAIMS', gold: false, group: 'first', file: 'tests/claims-set.ts', name: 'First set, false claims' },
  { id: 'TRUE_CLAIMS', gold: true, group: 'first', file: 'tests/claims-set.ts', name: 'First set, true claims' },
  { id: 'HOLD_FALSE', gold: false, group: 'holdout', file: 'tests/claims-holdout-set.ts', name: 'Hold-out set, false claims' },
  { id: 'HOLD_TRUE', gold: true, group: 'holdout', file: 'tests/claims-holdout-set.ts', name: 'Hold-out set, true claims' },
];

export interface RecordedScore { entails: number; contradicts: number }
export interface EvalClaim {
  set: ClaimSetId;
  /** True when the claim matches its abstract. Set by the team when the claim was written. */
  gold: boolean;
  claim: string;
  doi: string;
  /** The sentence the recorded score belongs to. */
  premise: string | null;
  score?: RecordedScore;
}
export interface ClaimsEvalPayload {
  kind: 'claims-eval';
  version: '1';
  provenance: {
    sourceHashes: Record<string, string>;
    abstractsNote: string;
    holdoutNote: string;
    model: string;
    recordedAt: string;
    loadMs: number;
    perClaimMs: number;
    premise: string;
    regenerate: string;
    counts: Record<ClaimSetId | 'abstracts' | 'scored', number>;
  };
  abstracts: Record<string, string>;
  claims: EvalClaim[];
}
export interface ClaimsEval { sha256: string; payload: ClaimsEvalPayload }

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const unit = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const hex = /^[a-f0-9]{64}$/;

/** A content and identity check, not a signature. It refuses data that would make the numbers on the page wrong. */
export async function validateClaimsEval(value: unknown): Promise<ClaimsEval> {
  if (!object(value) || typeof value.sha256 !== 'string' || !hex.test(value.sha256) || !object(value.payload)) throw new Error('The claim benchmark data has no integrity envelope.');
  const p = value.payload;
  if (await digest(p) !== value.sha256) throw new Error('The claim benchmark data does not match its hash. No numbers were worked out.');
  if (p.kind !== 'claims-eval' || p.version !== '1') throw new Error('The claim benchmark data is a different kind or version.');
  const pv = p.provenance;
  if (!object(pv) || typeof pv.model !== 'string' || typeof pv.recordedAt !== 'string' || !Number.isFinite(Date.parse(pv.recordedAt))) throw new Error('The claim benchmark data does not say which model recorded its scores, or when.');
  if (typeof pv.holdoutNote !== 'string' || !pv.holdoutNote || typeof pv.abstractsNote !== 'string' || !pv.abstractsNote) throw new Error('The claim benchmark data has lost its notes on where the claims come from.');
  if (!object(pv.sourceHashes) || !Object.values(pv.sourceHashes).every((h) => typeof h === 'string' && hex.test(h))) throw new Error('The claim benchmark data has invalid source hashes.');
  if (!object(pv.counts) || !object(p.abstracts) || !Object.values(p.abstracts).every((t) => typeof t === 'string' && t)) throw new Error('The claim benchmark data is incomplete.');
  if (!Array.isArray(p.claims)) throw new Error('The claim benchmark data has no claims.');
  const abstracts = p.abstracts as Record<string, string>;
  const seen = new Set<string>();
  for (const c of p.claims as unknown[]) {
    if (!object(c) || typeof c.claim !== 'string' || !c.claim || typeof c.doi !== 'string' || !abstracts[c.doi]) throw new Error('A claim in the benchmark data has no abstract.');
    const set = CLAIM_SETS.find((s) => s.id === c.set);
    if (!set || c.gold !== set.gold) throw new Error('A claim in the benchmark data has a gold label that does not match its set.');
    if (seen.has(c.claim)) throw new Error('A claim appears twice in the benchmark data.');
    seen.add(c.claim);
    if (c.premise !== null && (typeof c.premise !== 'string' || !abstracts[c.doi]!.includes(c.premise))) throw new Error('A recorded sentence is not in its abstract.');
    if (c.score !== undefined && (!object(c.score) || !unit(c.score.entails) || !unit(c.score.contradicts))) throw new Error('A recorded score is not between 0 and 1.');
  }
  const claims = p.claims as EvalClaim[];
  const counts = pv.counts as Record<string, unknown>;
  const want: Record<string, number> = { ...Object.fromEntries(CLAIM_SETS.map((s) => [s.id, claims.filter((c) => c.set === s.id).length])), abstracts: Object.keys(abstracts).length, scored: claims.filter((c) => c.score).length };
  if (Object.entries(want).some(([k, n]) => counts[k] !== n)) throw new Error('The claim benchmark counts do not match its claims.');
  return immutable(value as unknown as ClaimsEval);
}

/** The data arrives in its own small file, so the page can show it loading. */
export const loadClaimsEval = async (): Promise<ClaimsEval> => validateClaimsEval((await import('./claims-eval.json')).default);
