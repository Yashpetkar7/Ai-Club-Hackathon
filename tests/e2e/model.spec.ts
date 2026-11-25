import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FALSE_CLAIMS, TRUE_CLAIMS } from '../claims-set';
import { HOLD_FALSE, HOLD_TRUE } from '../claims-holdout-set';
import { judge, type Support } from '../../src/core/claims/label';
import { rankSentences } from '../../src/core/claims/rank';

/**
 * Runs the real on-device model in Chrome on every claim and records its scores.
 * Downloads about 95 MB. Run with:  MODEL=1 npx playwright test tests/e2e/model.spec.ts
 */
test.skip(process.env.MODEL !== '1', 'needs the network and about 95 MB');
test.setTimeout(600_000);

test('the real support model, in a worker, in Chrome', async ({ page }) => {
  await page.goto('/#/rules');
  const pairs = [...FALSE_CLAIMS, ...TRUE_CLAIMS, ...HOLD_FALSE, ...HOLD_TRUE].map(([claim, text]) => ({ claim, text, premise: rankSentences(text, claim)[0]?.text })).filter((p) => p.premise);
  const out = await page.evaluate(async (list) => {
    const path = '/src/core/claims/support.ts';
    const s = await import(/* @vite-ignore */ path);
    const t0 = performance.now();
    s.loadSupport();
    await new Promise<void>((ok, no) => s.onSupport(() => { const x = s.supportState(); if (x.status === 'ready') ok(); if (x.status === 'failed') no(new Error(x.why)); }));
    const loadMs = performance.now() - t0;
    const scores: Record<string, { entails: number; contradicts: number }> = {};
    const t1 = performance.now();
    for (const p of list) scores[p.claim] = await s.scoreSupport(p.premise, p.claim);
    return { loadMs, perClaimMs: (performance.now() - t1) / list.length, scores };
  }, pairs as { claim: string; premise: string }[]);
  const check = { verdict: 'confirmed', reasons: [], fields: [], trace: [], checkedAt: '' } as any;
  const label = ([c, t]: [string, string]) => judge(c, { text: t, check }, rankSentences(t, c)[0]?.text, (out.scores[c] as Support) ?? null).label;
  const n = (l: [string, string][]) => `${l.filter((x) => label(x) === 'verified').length}/${l.length}`;
  console.log(`load ${Math.round(out.loadMs)} ms, ${Math.round(out.perClaimMs)} ms a claim. False Verified: first set ${n(FALSE_CLAIMS)}, hold-out ${n(HOLD_FALSE)}. True Verified: first set ${n(TRUE_CLAIMS)}, hold-out ${n(HOLD_TRUE)}`);
  const alone = [...FALSE_CLAIMS, ...HOLD_FALSE].filter(([c]) => (out.scores[c]?.entails ?? 0) >= 0.9).map(([c]) => c);
  console.log(`The model alone would have passed ${alone.length} false claims: ${alone.join(' | ')}`);
  writeFileSync('tests/unit/fixtures/nli.json', `${JSON.stringify({ model: 'Xenova/nli-deberta-v3-xsmall, q8, wasm, in Chrome', recordedAt: new Date().toISOString(), loadMs: Math.round(out.loadMs), perClaimMs: Math.round(out.perClaimMs), scores: Object.fromEntries(Object.entries(out.scores).map(([k, v]) => [k, { entails: +v.entails.toFixed(4), contradicts: +v.contradicts.toFixed(4) }])) }, null, 1)}\n`);
  expect([...FALSE_CLAIMS, ...HOLD_FALSE].filter((x) => label(x) === 'verified').map(([c]) => c)).toEqual([]);
});
