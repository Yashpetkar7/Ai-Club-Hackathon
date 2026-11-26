// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ReferenceCheck } from '@/core/contracts';
import { judge, type Support } from '@/core/claims/label';
import { mostSupported, startAt } from '@/core/claims/nli';
import { FALSE_CLAIMS, TRUE_CLAIMS } from '../claims-set';
import { HOLD_FALSE, HOLD_TRUE } from '../claims-holdout-set';

/**
 * Where a page starts when it has scored several candidate sentences. The scores come from the real models,
 * recorded by tests/e2e/model-candidates.spec.ts (MODEL=1), once per support model. A missing recording is skipped.
 */
const FILES = ['tests/unit/fixtures/nli-candidates.json', 'tests/unit/fixtures/nli-candidates-scifact.json'];
type Cand = Support & { text: string; meaning: number | null };
type Row = { set: string; claim: string; words: Cand[]; meaning: Cand[] };
type Rec = { rows: Row[]; recordedAt: string; models: string[] };
const recordings: [string, Rec | null][] = FILES.map((f) => [f, existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Rec) : null]);
const confirmed = { verdict: 'confirmed', reasons: [], fields: [], trace: [], checkedAt: '' } as ReferenceCheck;
const text = new Map([...FALSE_CLAIMS, ...TRUE_CLAIMS, ...HOLD_FALSE, ...HOLD_TRUE].map(([c, t]) => [c, t]));
const isFalse = (r: Row) => r.set === 'false' || r.set === 'hold-false';

type Rule = 'first' | 'most-supported' | 'start-at';
function labelFor(r: Row, ranking: 'words' | 'meaning', n: number, rule: Rule) {
  const cands = r[ranking].slice(0, n);
  if (!cands.length) return 'reported';
  const src = { text: text.get(r.claim)!, check: confirmed };
  const judged = cands.map((c) => judge(r.claim, src, c.text, c));
  const i = rule === 'first' ? 0 : rule === 'most-supported' ? Math.max(0, mostSupported(cands)) : startAt(judged);
  return judged[i]!.label;
}
function tally(rec: Rec, ranking: 'words' | 'meaning', n: number, rule: Rule) {
  const rows = rec.rows;
  const f = rows.filter(isFalse);
  const t = rows.filter((r) => !isFalse(r));
  const v = (list: Row[], l = 'verified') => list.filter((r) => labelFor(r, ranking, n, rule) === l);
  return { falseVerified: v(f).map((r) => r.claim), falseDisputed: v(f, 'disputed').length, falseTotal: f.length, trueVerified: v(t).length, trueDisputed: v(t, 'disputed').map((r) => r.claim), trueTotal: t.length };
}

describe.each(recordings)('starting on a candidate sentence, with the real models (%s)', (_file, rec) => {
  if (!rec) {
    it.skip('not recorded yet');
    return;
  }
  it('the recording covers every labelled claim and each candidate is an exact slice of its abstract', () => {
    expect(rec.rows.length).toBe(FALSE_CLAIMS.length + TRUE_CLAIMS.length + HOLD_FALSE.length + HOLD_TRUE.length);
    for (const r of rec.rows) for (const c of [...r.words, ...r.meaning]) expect(text.get(r.claim)).toContain(c.text);
  });

  it('prints every rule side by side', () => {
    const lines: string[] = [];
    for (const ranking of ['words', 'meaning'] as const)
      for (const n of [1, 3, 4])
        for (const rule of ['first', 'most-supported', 'start-at'] as const) {
          if (n === 1 && rule !== 'first') continue;
          const x = tally(rec, ranking, n, rule);
          lines.push(`${ranking.padEnd(7)} top ${n} ${rule.padEnd(14)} false Verified ${x.falseVerified.length}/${x.falseTotal}, Disputed ${x.falseDisputed}  true Verified ${x.trueVerified}/${x.trueTotal}, Disputed ${x.trueDisputed.length}`);
        }
    console.log(`${rec.models[0]}, recorded ${rec.recordedAt}\n${lines.join('\n')}`);
    expect(lines.length).toBe(14);
  });

  it('the rule the pages use: no false claim Verified, no true claim Disputed, and as many disputes as the closest sentence', () => {
    for (const ranking of ['words', 'meaning'] as const)
      for (const n of [3, 4]) {
        const x = tally(rec, ranking, n, 'start-at');
        expect(x.falseVerified).toEqual([]);
        expect(x.trueDisputed).toEqual([]);
        expect(x.trueVerified).toBeGreaterThanOrEqual(tally(rec, ranking, n, 'most-supported').trueVerified);
        expect(x.falseDisputed).toBeGreaterThanOrEqual(tally(rec, ranking, n, 'first').falseDisputed);
      }
  });
});

describe('startAt', () => {
  const v = (label: string, wordForWord = false) => ({ label, wordForWord });
  it('starts on a word-for-word sentence that passes every check', () => {
    expect(startAt([v('reported'), v('disputed'), v('verified', true)])).toBe(2);
  });
  it('otherwise stays on the closest sentence, even when the model backs another one more', () => {
    expect(startAt([v('reported'), v('verified')])).toBe(0);
    expect(startAt([v('disputed'), v('verified')])).toBe(0);
    expect(startAt([])).toBe(0);
  });
});
