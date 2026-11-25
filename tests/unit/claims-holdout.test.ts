// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { ReferenceCheck } from '@/core/contracts';
import { judge, type Support } from '@/core/claims/label';
import { rankSentences } from '@/core/claims/rank';
import { HOLD_FALSE, HOLD_TRUE } from '../claims-holdout-set';

const check = { verdict: 'confirmed', reasons: [], fields: [], trace: [], checkedAt: '' } as ReferenceCheck;
const label = (c: string, t: string, s: Support | null) => judge(c, { text: t, check }, rankSentences(t, c)[0]?.text, s).label;
const yes: Support = { entails: 0.99, contradicts: 0.001 };
const NLI = 'tests/unit/fixtures/nli.json';
const scores: Record<string, Support> = existsSync(NLI) ? JSON.parse(readFileSync(NLI, 'utf8')).scores : {};

it('no false claim is Verified without AI', () => {
  expect(HOLD_FALSE.filter(([c, t]) => label(c, t, null) === 'verified').map(([c]) => c)).toEqual([]);
});
it('no false claim is Verified when the support model says yes to everything', () => {
  expect(HOLD_FALSE.filter(([c, t]) => label(c, t, yes) === 'verified').map(([c]) => c)).toEqual([]);
});
it.runIf(Object.keys(scores).length > 0)('no false claim is Verified with the real model’s recorded scores', () => {
  expect(HOLD_FALSE.filter(([c, t]) => label(c, t, scores[c] ?? null) === 'verified').map(([c]) => c)).toEqual([]);
});
it('no true claim is Disputed', () => {
  const n = (s: (c: string) => Support | null) => HOLD_TRUE.map(([c, t]) => [c, label(c, t, s(c))] as const);
  const off = n(() => null);
  const on = n(() => yes);
  console.info(`HOLDOUT true: no AI ${off.filter((x) => x[1] === 'verified').length}/${off.length}, support yes ${on.filter((x) => x[1] === 'verified').length}/${on.length}, not: ${on.filter((x) => x[1] !== 'verified').map((x) => x.join(' ')).join(' | ')}`);
  if (Object.keys(scores).length) console.info(`HOLDOUT true, real model: ${n((c) => scores[c] ?? null).filter((x) => x[1] === 'verified').length}/${HOLD_TRUE.length}`);
  expect([...off, ...on].filter((x) => x[1] === 'disputed')).toEqual([]);
});
