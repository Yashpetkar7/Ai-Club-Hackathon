// @vitest-environment node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rankSentences } from '@/core/claims/rank';
import { CLAIM_SETS, loadClaimsEval, validateClaimsEval, type ClaimsEvalPayload } from '@/core/lab/claims-data';
import { ABSTRACT, FALSE_CLAIMS, TRUE_CLAIMS } from '../claims-set';
import { HOLD_FALSE, HOLD_TRUE } from '../claims-holdout-set';

/**
 * Builds the browser copy of the claim sets (src/core/lab/claims-eval.json) from the test sources, and fails when the
 * stored copy has drifted from them. It never invents a score: a claim without a recorded score is stored without one.
 * Refresh after a reviewed change to a source:  LAB_WRITE_CLAIMS=1 npx vitest run tests/unit/lab-claims-eval.test.ts
 */
const target = 'src/core/lab/claims-eval.json';
const NLI = 'tests/unit/fixtures/nli.json';
const sources = ['tests/claims-set.ts', 'tests/claims-holdout-set.ts', 'tests/unit/fixtures/abstracts.json', NLI] as const;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
// Line endings are normalised so a Windows checkout gives the same hash.
const text = (file: string) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const firstDocComment = (file: string) => (text(file).match(/\/\*\*([\s\S]*?)\*\//)?.[1] ?? '').split('\n').map((l) => l.replace(/^\s*\*\s?/, '').trim()).filter(Boolean).join(' ');

type Recorded = { model: string; recordedAt: string; loadMs: number; perClaimMs: number; scores: Record<string, { entails: number; contradicts: number }> };

function build(): ClaimsEvalPayload {
  const nli = JSON.parse(text(NLI)) as Recorded;
  const doiOf = (abstract: string) => {
    const hit = Object.entries(ABSTRACT).find(([, t]) => t === abstract);
    if (!hit) throw new Error('A claim points at text that is not one of the recorded abstracts.');
    return hit[0];
  };
  const lists = { FALSE_CLAIMS, TRUE_CLAIMS, HOLD_FALSE, HOLD_TRUE };
  const claims = CLAIM_SETS.flatMap((set) => lists[set.id].map(([claim, abstract]) => {
    const score = nli.scores[claim];
    const premise = rankSentences(abstract, claim)[0]?.text ?? null;
    return { set: set.id, gold: set.gold, claim, doi: doiOf(abstract), premise, ...(score ? { score: { entails: score.entails, contradicts: score.contradicts } } : {}) };
  }));
  return {
    kind: 'claims-eval',
    version: '1',
    provenance: {
      sourceHashes: Object.fromEntries(sources.map((f) => [f, sha(text(f))])),
      abstractsNote: firstDocComment('tests/claims-set.ts'),
      holdoutNote: firstDocComment('tests/claims-holdout-set.ts'),
      model: nli.model,
      recordedAt: nli.recordedAt,
      loadMs: nli.loadMs,
      perClaimMs: nli.perClaimMs,
      premise: 'Each score is the model reading the claim against one sentence: the closest sentence by shared words (rankSentences), the way tests/e2e/model.spec.ts records it. That sentence is stored as premise. When the ranking code picks a different sentence, the score no longer fits and must be recorded again with MODEL=1.',
      regenerate: 'LAB_WRITE_CLAIMS=1 npx vitest run tests/unit/lab-claims-eval.test.ts',
      counts: { ...Object.fromEntries(CLAIM_SETS.map((s) => [s.id, lists[s.id].length])), abstracts: Object.keys(ABSTRACT).length, scored: claims.filter((c) => c.score).length },
    },
    abstracts: { ...ABSTRACT },
    claims,
  } as ClaimsEvalPayload;
}

describe('the claim benchmark data', () => {
  const payload = build();
  if (process.env.LAB_WRITE_CLAIMS === '1') writeFileSync(target, `${JSON.stringify({ sha256: sha(JSON.stringify(payload)), payload }, null, 1)}\n`);

  it('is stored, and its hash matches its content', () => {
    expect(existsSync(target), 'Generate it with LAB_WRITE_CLAIMS=1; never write it by hand.').toBe(true);
    const saved = JSON.parse(text(target));
    expect(saved.sha256).toBe(sha(JSON.stringify(saved.payload)));
  });

  it('has not drifted from the test sources: claims, gold labels, abstracts, recorded scores and the sentence each score belongs to', () => {
    const saved = JSON.parse(text(target));
    expect(saved.payload).toEqual(payload);
  });

  it('keeps every claim, with the counts the test sets declare', () => {
    expect(payload.provenance.counts).toEqual({ FALSE_CLAIMS: 42, TRUE_CLAIMS: 14, HOLD_FALSE: 38, HOLD_TRUE: 10, abstracts: 8, scored: 104 });
    expect(new Set(payload.claims.map((c) => c.claim)).size).toBe(payload.claims.length);
    expect(payload.claims.every((c) => c.premise)).toBe(true);
  });

  it('carries the hold-out caveat word for word from its file', () => {
    expect(payload.provenance.holdoutNote).toMatch(/^Claims about papers the guards were not written against\./);
    expect(payload.provenance.holdoutNote).toMatch(/Those 7 became rules, so this set is now a regression test, not a measurement\.$/);
  });

  it('loads in the browser module, checked and frozen', async () => {
    const data = await loadClaimsEval();
    expect(data.payload.claims).toHaveLength(104);
    expect(data.payload.claims.filter((c) => c.gold)).toHaveLength(24);
    expect(Object.isFrozen(data.payload.claims[0])).toBe(true);
  });

  it('refuses an edited copy', async () => {
    const saved = JSON.parse(text(target));
    saved.payload.claims[0].claim += ' changed';
    await expect(validateClaimsEval(saved)).rejects.toThrow(/hash/i);
  });

  it('refuses a copy whose gold labels were changed, even with a new hash', async () => {
    const flipped = JSON.parse(text(target));
    flipped.payload.claims[0].gold = true;
    flipped.sha256 = sha(JSON.stringify(flipped.payload));
    await expect(validateClaimsEval(flipped)).rejects.toThrow(/gold/i);
    const moved = JSON.parse(text(target));
    Object.assign(moved.payload.claims[0], { set: 'TRUE_CLAIMS', gold: true });
    moved.sha256 = sha(JSON.stringify(moved.payload));
    await expect(validateClaimsEval(moved)).rejects.toThrow(/count/i);
  });

  it('refuses a score outside 0 to 1', async () => {
    const saved = JSON.parse(text(target));
    saved.payload.claims[0].score.entails = 1.5;
    saved.sha256 = sha(JSON.stringify(saved.payload));
    await expect(validateClaimsEval(saved)).rejects.toThrow(/score/i);
  });
});
