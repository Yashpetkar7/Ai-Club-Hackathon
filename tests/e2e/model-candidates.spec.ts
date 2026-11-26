import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FALSE_CLAIMS, TRUE_CLAIMS } from '../claims-set';
import { HOLD_FALSE, HOLD_TRUE } from '../claims-holdout-set';

/**
 * Runs both real on-device models in Chrome and records the support scores for every candidate sentence
 * the pages can start on: the top 4 by shared words, and the top 4 by meaning and words together.
 * The labels are worked out from this recording in tests/unit/best-candidate.test.ts.
 * Downloads about 120 MB. Run with:  MODEL=1 npx playwright test tests/e2e/model-candidates.spec.ts
 */
test.skip(process.env.MODEL !== '1', 'needs the network and about 120 MB');
test.setTimeout(1_800_000);

test('support scores for every candidate sentence, both rankings, real models', async ({ page }) => {
  await page.goto('/#/rules');
  const sets = { false: FALSE_CLAIMS, true: TRUE_CLAIMS, 'hold-false': HOLD_FALSE, 'hold-true': HOLD_TRUE };
  const pairs = Object.entries(sets).flatMap(([set, list]) => list.map(([claim, text]) => ({ set, claim, text })));
  const out = await page.evaluate(async (list) => {
    const sup = await import(/* @vite-ignore */ '/src/core/claims/support.ts');
    const mean = await import(/* @vite-ignore */ '/src/core/semantic/meaning.ts');
    const rank = await import(/* @vite-ignore */ '/src/core/semantic/rank.ts');
    const ready = (load: () => void, on: (f: () => void) => () => void, state: () => { status: string; why?: string }) =>
      new Promise<void>((ok, no) => {
        load();
        const check = () => { const x = state(); if (x.status === 'ready') ok(); if (x.status === 'failed') no(new Error(x.why)); };
        on(check);
        check();
      });
    const t0 = performance.now();
    await ready(sup.loadSupport, sup.onSupport, sup.supportState);
    await ready(mean.loadMeaning, mean.onMeaning, mean.meaningState);
    const loadMs = performance.now() - t0;
    const scored = new Map<string, { entails: number; neutral: number; contradicts: number }>();
    const score = async (premise: string, claim: string) => {
      const k = `${claim}\u0000${premise}`;
      if (!scored.has(k)) {
        const s = await sup.scoreSupport(premise, claim, 60_000);
        scored.set(k, { entails: +s.entails.toFixed(4), neutral: +(s.neutral ?? 0).toFixed(4), contradicts: +s.contradicts.toFixed(4) });
      }
      return scored.get(k)!;
    };
    const rows = [];
    const t1 = performance.now();
    for (const p of list) {
      const words = await rank.hybridRank(p.claim, p.text, undefined, { max: 4 });
      const meaning = await rank.hybridRank(p.claim, p.text, mean.embedder, { max: 4 });
      const pack = async (cs: { text: string; meaning: number | null }[]) => {
        const res = [];
        for (const c of cs) res.push({ text: c.text, meaning: c.meaning === null ? null : +c.meaning.toFixed(4), ...(await score(c.text, p.claim)) });
        return res;
      };
      rows.push({ set: p.set, claim: p.claim, words: await pack(words), meaning: await pack(meaning) });
    }
    return { loadMs, perScoreMs: (performance.now() - t1) / Math.max(1, scored.size), runs: scored.size, rows };
  }, pairs);
  writeFileSync(
    'tests/unit/fixtures/nli-candidates.json',
    `${JSON.stringify(
      {
        models: ['Xenova/nli-deberta-v3-xsmall, q8, wasm, in Chrome', 'Snowflake/snowflake-arctic-embed-xs, q8, wasm, in Chrome'],
        recordedAt: new Date().toISOString(),
        loadMs: Math.round(out.loadMs),
        perScoreMs: Math.round(out.perScoreMs),
        runs: out.runs,
        note: 'Support scores for the top 4 candidates by shared words and by meaning plus words, for every claim in tests/claims-set.ts and tests/claims-holdout-set.ts. Recorded by tests/e2e/model-candidates.spec.ts.',
        rows: out.rows,
      },
      null,
      1,
    )}\n`,
  );
  expect(out.rows.length).toBe(pairs.length);
});
