// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ReferenceCheck } from '@/core/contracts';
import { judge, type Support } from '@/core/claims/label';
import { rankSentences } from '@/core/claims/rank';
import { SUPPORT } from '@/core/claims/support';
import { FALSE_CLAIMS, TRUE_CLAIMS } from '../claims-set';
import { HOLD_FALSE, HOLD_TRUE } from '../claims-holdout-set';

/**
 * The original model and our SciFact fine-tune, each scored in Chrome by tests/e2e/model.spec.ts.
 * Whichever the site runs must let no false claim become Verified.
 */
const check = { verdict: 'confirmed', reasons: [], fields: [], trace: [], checkedAt: '' } as ReferenceCheck;
const FIX = { original: 'tests/unit/fixtures/nli.json', scifact: 'tests/unit/fixtures/nli-scifact.json' } as const;
const load = (p: string): Record<string, Support> => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')).scores : {});

function tally(scores: Record<string, Support>) {
  const label = ([c, t]: [string, string]) => judge(c, { text: t, check }, rankSentences(t, c)[0]?.text, scores[c] ?? null).label;
  const n = (l: [string, string][]) => l.filter((x) => label(x) === 'verified').length;
  const alone = [...FALSE_CLAIMS, ...HOLD_FALSE].filter(([c]) => (scores[c]?.entails ?? 0) >= 0.9).length;
  return { falseVerified: n(FALSE_CLAIMS) + n(HOLD_FALSE), falseTotal: FALSE_CLAIMS.length + HOLD_FALSE.length, trueVerified: n(TRUE_CLAIMS) + n(HOLD_TRUE), trueTotal: TRUE_CLAIMS.length + HOLD_TRUE.length, modelAloneWouldPass: alone };
}

describe.each(Object.entries(FIX))('%s model, scores recorded in Chrome', (key, path) => {
  const scores = load(path);
  it.runIf(Object.keys(scores).length > 0)('no false claim is Verified', () => {
    const t = tally(scores);
    console.info(`SUPPORT_MODEL ${key}: ${JSON.stringify(t)}`);
    expect(t.falseVerified).toBe(0);
  });
});

it('the site runs a model whose recorded scores exist and pass', () => {
  const scores = load(FIX[SUPPORT.key]);
  expect(Object.keys(scores).length).toBeGreaterThan(0);
  expect(tally(scores).falseVerified).toBe(0);
});
