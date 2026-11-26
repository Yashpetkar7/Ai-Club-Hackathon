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
 * recorded by tests/e2e/model-candidates.spec.ts (MODEL=1). Without that recording these tests are skipped.
 */
const FILE = 'tests/unit/fixtures/nli-candidates.json';
type Cand = Support & { text: string; meaning: number | null };
type Row = { set: string; claim: string; words: Cand[]; meaning: Cand[] };
const rec: { rows: Row[]; recordedAt: string } | null = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : null;
const confirmed = { verdict: 'confirmed', reasons: [], fields: [], trace: [], checkedAt: '' } as ReferenceCheck;
const text = new Map([...FALSE_CLAIMS, ...TRUE_CLAIMS, ...HOLD_FALSE, ...HOLD_TRUE].map(([c, t]) => [c, t]));
const isFalse = (r: Row) => r.set === 'false' || r.set === 'hold-false';

type Rule = 'first' | 'most-supported' | 'start-at';
function labelFor(r: Row, ranking: 'words' | 'meaning', n: number, rule: Rule) {
  const cands = r[ranking].slice(0, n);
  if (!cands.length) return 'reported';
  const src = { text: text.get(r.claim)!, check: confirmed };
  const judged = cands.map((c) => judge(r.claim, src, c.text, c));
  const i = rule === 'first' ? 0 : rule === 'most-supported' ? Math.max(0, mostSupported(cands)) : startAt(judged, cands);
  return judged[i]!.label;
}
function tally(ranking: 'words' | 'meaning', n: number, rule: Rule) {
  const rows = rec!.rows;
  const f = rows.filter(isFalse);
  const t = rows.filter((r) => !isFalse(r));
  const v = (list: Row[]) => list.filter((r) => labelFor(r, ranking, n, rule) === 'verified');
  return { falseVerified: v(f).map((r) => r.claim), falseTotal: f.length, trueVerified: v(t).length, trueTotal: t.length };
}

describe.skipIf(!rec)('starting on a candidate sentence, with the real models', () => {
  it('the recording covers every labelled claim and each candidate is an exact slice of its abstract', () => {
    expect(rec!.rows.length).toBe(FALSE_CLAIMS.length + TRUE_CLAIMS.length + HOLD_FALSE.length + HOLD_TRUE.length);
    for (const r of rec!.rows) for (const c of [...r.words, ...r.meaning]) expect(text.get(r.claim)).toContain(c.text);
  });

  it('prints every rule side by side', () => {
    const lines: string[] = [];
    for (const ranking of ['words', 'meaning'] as const)
      for (const n of [1, 3, 4])
        for (const rule of ['first', 'most-supported', 'start-at'] as const) {
          if (n === 1 && rule !== 'first') continue;
          const x = tally(ranking, n, rule);
          lines.push(`${ranking.padEnd(7)} top ${n} ${rule.padEnd(14)} false Verified ${x.falseVerified.length}/${x.falseTotal}  true Verified ${x.trueVerified}/${x.trueTotal}${x.falseVerified.length ? `  [${x.falseVerified.join(' | ')}]` : ''}`);
        }
    console.log(`Recorded ${rec!.recordedAt}\n${lines.join('\n')}`);
    expect(lines.length).toBe(14);
  });

  it('the rule the pages use never starts on a false Verified, by words or by meaning, top 3 or top 4', () => {
    for (const ranking of ['words', 'meaning'] as const) for (const n of [3, 4]) expect(tally(ranking, n, 'start-at').falseVerified).toEqual([]);
  });
});

describe('startAt', () => {
  const v = (label: string, wordForWord = false) => ({ label, wordForWord });
  it('starts on a word-for-word sentence that passes every check', () => {
    expect(startAt([v('reported'), v('disputed'), v('verified', true)], [{ entails: 0.99 }, { entails: 0.1, contradicts: 0.95 }, { entails: 0.5 }])).toBe(2);
  });
  it('otherwise a sentence that disputes the claim wins over one that backs it', () => {
    expect(startAt([v('verified'), v('disputed'), v('disputed')], [{ entails: 0.99 }, { entails: 0.1, contradicts: 0.5 }, { entails: 0.1, contradicts: 0.97 }])).toBe(2);
  });
  it('otherwise the best supported, and the closest when nothing was scored', () => {
    expect(startAt([v('reported'), v('verified')], [{ entails: 0.4 }, { entails: 0.95 }])).toBe(1);
    expect(startAt([v('reported'), v('reported')], [null, null])).toBe(0);
  });
});
