import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockRegistries, watchErrors } from './mock';

const axe = async (page: Page, name: string) => {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => `${name}: ${v.id} ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const noSideways = async (page: Page, name: string) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), name).toBeLessThanOrEqual(1);
const ABSTRACT: Record<string, string> = JSON.parse(readFileSync('tests/unit/fixtures/abstracts.json', 'utf8'));

/** Recorded registry answers, with the real abstracts put back into the OpenAlex records (they are stored without them). */
async function withAbstracts(page: Page): Promise<string[]> {
  const unknown = await mockRegistries(page);
  const store = JSON.parse(readFileSync('tests/unit/fixtures/registry.json', 'utf8'));
  const dress = (w: any) => {
    const t = ABSTRACT[String(w.doi ?? '').replace('https://doi.org/', '')];
    return t ? { ...w, abstract_inverted_index: Object.fromEntries(Object.entries(Object.groupBy(t.split(' ').map((x, i) => [x, i] as const), ([x]) => x)).map(([k, v]) => [k, v!.map(([, i]) => i)])) } : w;
  };
  await page.route(/\/api\/registry\?url=https%3A%2F%2Fapi\.openalex\.org/, (r) => {
    const url = new URL(r.request().url()).searchParams.get('url') ?? '';
    const hit = store[url];
    if (!hit) unknown.push(url);
    return hit ? r.fulfill({ status: hit.status, json: hit.status === 200 ? dress(hit.body) : {} }) : r.fulfill({ status: 503, json: {} });
  });
  return unknown;
}

async function runSample(page: Page) {
  await page.getByRole('button', { name: 'Try the sample' }).click();
  await expect(page.getByText('3 of 3 checked.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Comparing claims with their sources/)).toHaveCount(0);
}

test('audit: references stamped, 13% Verified, 31% Disputed, invented DOI Not found, nothing asked before the click', async ({ page }) => {
  // Stamps fade in. Contrast is measured on the finished page.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = watchErrors(page);
  const unknown = await withAbstracts(page);
  const asked: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/registry') || /crossref|openalex|datacite|doi\.org/.test(new URL(r.url()).hostname)) asked.push(r.url());
  });

  await page.goto('/#/audit');
  await expect(page.getByRole('heading', { name: 'Audit a paragraph', level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Audit' })).toHaveAttribute('aria-current', 'page');
  await axe(page, 'audit empty');
  await page.getByLabel('Paste a paragraph with its references').fill('Home working led to a 13% performance increase.');
  await page.waitForTimeout(300);
  expect(asked, 'no registry is asked before Check it').toEqual([]);

  await runSample(page);
  await expect(page.locator('.sample')).toContainText('SAMPLE');
  await expect(page.getByText(/changes Bloom’s 13% to 31% on purpose/)).toBeVisible();
  expect(unknown).toEqual([]);

  // References: each one stamped, with where we looked.
  const refs = page.getByRole('list', { name: 'References and their checks' });
  await expect(refs.getByRole('listitem')).toHaveCount(3);
  await expect(refs.locator('.stamp', { hasText: 'Confirmed' })).toHaveCount(2);
  const invented = refs.getByRole('listitem').filter({ hasText: 'Trust decay in algorithmic tutoring' });
  await expect(invented.locator('.stamp')).toHaveText(/Not found$/);
  await expect(invented).toContainText('This DOI does not exist.');
  await expect(invented).toContainText(/Where we looked: Crossref .*doi.org no record/);
  await expect(invented).not.toContainText(/fake/i);
  await expect(refs.getByRole('listitem').filter({ hasText: 'Does working from home work' })).toContainText('Abstract only: claims are compared with its abstract.');

  // Summary: a traceability count, said to be one.
  const summary = page.getByRole('region', { name: 'Summary' });
  await expect(summary).toContainText('Traced: 2 of 5 claims verified against their cited sources.');
  await expect(summary).toContainText('It is not a truth score');
  for (const t of ['2 confirmed', '1 not found', '2 Verified', '1 Disputed', '1 Reported, not checked', '1 not traceable']) await expect(summary.locator('.stamp', { hasText: t })).toBeVisible();

  // The 13% claim in the abstract's own words.
  const right = page.locator('#claim-c1');
  await expect(right).toContainText('Home working led to a 13% performance increase.');
  await expect(right.locator('.stamp').first()).toHaveText(/Verified$/);
  await expect(right.getByText('✓ word for word')).toBeVisible();
  await expect(right.getByText('abstract only')).toBeVisible();

  // The same sentence with 31%: Disputed, the numbers side by side and marked in the source sentence.
  const wrong = page.locator('#claim-c2');
  await expect(wrong).toContainText('31% performance increase');
  await expect(wrong.locator('.stamp').first()).toHaveText(/Disputed$/);
  await expect(wrong.getByText('A number does not match the source.')).toBeVisible();
  await expect(wrong.getByRole('row', { name: /Numbers match/ }).locator('strong')).toHaveText(['31%', '13%']);
  await expect(wrong.locator('blockquote strong')).toHaveText(['13%']);

  // The joined sentence becomes two claims; the invented reference has nothing to trace to.
  await expect(page.locator('#claim-c4')).toContainText('One part of:');
  await expect(page.locator('#claim-c4 .stamp').first()).toHaveText(/Verified$/);
  await expect(page.locator('#claim-c3 .stamp').first()).toHaveText(/Reported, not checked$/);
  await expect(page.locator('#claim-c3')).toContainText('Not compared yet.');
  const lost = page.locator('#claim-c5');
  await expect(lost.locator('.stamp').first()).toHaveText(/Reported, not checked$/);
  await expect(lost).toContainText('This reference was not found in the registries we searched');

  // The matrix: one row per claim, cells open by keyboard.
  const matrix = page.getByRole('region', { name: 'Claims against references' });
  await expect(matrix.getByRole('row')).toHaveCount(6);
  const first = matrix.getByRole('button', { name: /Claim 1 against \[1\]/ });
  await expect(first).toContainText('Verified');
  await first.focus();
  await page.keyboard.press('ArrowDown');
  await expect(matrix.getByRole('button', { name: /Claim 2 against \[1\]/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(wrong).toBeFocused();
  await axe(page, 'audit results');

  // A receipt opens in place.
  await refs.getByRole('listitem').first().getByText('Show the receipt').click();
  await expect(refs.locator('article').first()).toContainText('Crossref has it');
  await axe(page, 'audit receipt');
  await page.screenshot({ path: 'test-results/audit.png', fullPage: true });

  await page.setViewportSize({ width: 375, height: 812 });
  await noSideways(page, 'audit at 375 px');
  // The Audit link keeps the phone header to two rows (the same limit as trust.spec.ts).
  expect((await page.locator('header').first().boundingBox())!.height).toBeLessThan(96);
  await axe(page, 'audit at 375 px');
  await page.screenshot({ path: 'test-results/audit-375.png', fullPage: true });
  expect(errors).toEqual([]);
});

/**
 * A FAKE stand-in for both on-device models, for this test only. It answers in the worker's own message format,
 * so the page runs as it would with the real models, and nothing is downloaded. Its numbers are made up.
 */
async function fakeModels(page: Page) {
  await page.addInitScript(() => {
    const Real = window.Worker;
    const vec = (t: string) => [/40%|time/.test(t) ? 1 : 0, /13%|31%|performance/.test(t) ? 1 : 0, /18%|quality/.test(t) ? 1 : 0, 0.05];
    class FakeModels {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onerror: (() => void) | null = null;
      dead = false;
      constructor(url: URL | string, opts?: WorkerOptions) {
        if (!String(url).includes('support.worker')) return new Real(url, opts) as unknown as FakeModels;
      }
      postMessage(m: any) {
        setTimeout(() => this.answer(m), 20);
      }
      answer(m: any) {
        const say = (data: unknown) => !this.dead && this.onmessage?.({ data });
        if (m.type === 'load') {
          say({ type: 'progress', loaded: 40e6, total: 87e6 });
          say({ type: 'ready' });
        } else if (m.type === 'load-embed') {
          say({ type: 'embed-progress', loaded: 10e6, total: 23e6 });
          say({ type: 'embed-ready' });
        } else if (m.type === 'embed') {
          const vs = m.texts.map(vec);
          say({ type: 'embedded', id: m.id, dims: vs[0].length, data: new Float32Array(vs.flat()) });
        } else if (m.type === 'score') {
          const backs = /40%/.test(m.premise) && /40%/.test(m.hypothesis);
          say({ type: 'score', id: m.id, entails: backs ? 0.95 : 0.05, neutral: backs ? 0.04 : 0.9, contradicts: backs ? 0.01 : 0.05 });
        }
      }
      terminate() {
        this.dead = true;
      }
      addEventListener() {}
      removeEventListener() {}
    }
    (window as any).Worker = FakeModels;
  });
}

test('audit: compare the meaning on this device, with FAKE on-device models', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = watchErrors(page);
  await fakeModels(page);
  await withAbstracts(page);
  await page.goto('/#/audit');
  await runSample(page);
  await expect(page.locator('#claim-c3 .stamp').first()).toHaveText(/Reported, not checked$/);

  await expect(page.getByText(/download about 123 MB once \(23 MB to find sentences by meaning, 100 MB to score support\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Compare the meaning on this device' }).click();
  await expect(page.getByText('Meaning is compared on this device.')).toBeVisible();

  // Support above the line and every check passing: the claim in other words is now Verified.
  const card = page.locator('#claim-c3');
  await expect(card.locator('.stamp').first()).toHaveText(/Verified$/, { timeout: 15_000 });
  await expect(card.locator('[data-tone=model]')).toContainText('95%');
  await expect(card.getByText('The line is at 90%. Verified needs support at or above it, and every check passing.')).toBeVisible();
  await expect(card.locator('[data-tone=aid]', { hasText: 'Meaning match' })).toBeVisible();
  // A wrong number stays Disputed whatever the model says.
  await expect(page.locator('#claim-c2 .stamp').first()).toHaveText(/Disputed$/);
  const summary = page.getByRole('region', { name: 'Summary' });
  await expect(summary).toContainText('Traced: 3 of 5 claims verified against their cited sources.');
  await expect(page.getByRole('region', { name: 'Claims against references' }).getByRole('button', { name: /Claim 3 against \[2\]/ })).toContainText('support 95%');
  await axe(page, 'audit with meaning');

  await page.getByRole('button', { name: 'Turn off and free the memory' }).click();
  await expect(page.getByRole('button', { name: 'Compare the meaning on this device' })).toBeVisible();
  await expect(page.locator('#claim-c3 .stamp').first()).toHaveText(/Reported, not checked$/);
  expect(errors).toEqual([]);
});

test('audit: offline notice, and Cancel leaves a slow reference not checked', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = watchErrors(page);
  await withAbstracts(page);
  // The invented DOI's registries never answer in this test.
  await page.route(/pnas\.1523821113/, () => {});
  await page.goto('/#/audit');
  // The page itself must have arrived before the connection goes.
  await expect(page.getByRole('heading', { name: 'Audit a paragraph', level: 1 })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByText(/You are offline\. References cannot be looked up now/)).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText(/You are offline/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Try the sample' }).click();
  const summary = page.getByRole('region', { name: 'Summary' });
  await expect(summary).toContainText('Checked 2 of 3…', { timeout: 30_000 });
  await summary.getByRole('button', { name: 'Cancel the check' }).click();
  await expect(summary).toContainText('2 of 3 checked.');
  await expect(summary.locator('.stamp', { hasText: '1 not checked yet' })).toBeVisible();
  await expect(summary).toContainText('Traced: 2 of 5 claims verified against their cited sources.');
  const refs = page.getByRole('list', { name: 'References and their checks' });
  await expect(refs.getByRole('listitem').filter({ hasText: 'Trust decay' })).toContainText('Not checked: the check was cancelled.');
  await expect(page.locator('#claim-c5')).toContainText('Not checked: the reference check was cancelled.');
  await expect(page.getByRole('button', { name: 'Check it' })).toBeEnabled();
  await axe(page, 'audit cancelled');
  expect(errors).toEqual([]);
});
