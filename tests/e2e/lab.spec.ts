import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockRegistries, watchErrors } from './mock';

const axe = async (page: Page, name: string) => {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => `${name}: ${v.id} ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const noSideways = async (page: Page, name: string) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), name).toBeLessThanOrEqual(1);

test('lab: how accurate is it, worked out on load with no lookups, clean at 375 px and by keyboard', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = watchErrors(page);
  await mockRegistries(page);
  const asked: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/registry') || /crossref|openalex|datacite|doi\.org|huggingface/.test(new URL(r.url()).hostname)) asked.push(r.url());
  });

  await page.goto('/#/lab');
  const bench = page.getByRole('region', { name: 'How accurate is it?' });
  await expect(bench.getByRole('heading', { name: 'Claim checker' })).toBeVisible();
  await expect(bench.getByRole('list', { name: 'Claim checker numbers' }).getByRole('listitem').first()).toContainText('0 of 80');
  await expect(bench.getByText(/Those 7 became rules/)).toBeVisible();
  await expect(bench.getByRole('img', { name: /support score alone decided Verified/ })).toBeVisible();
  await axe(page, 'lab benchmark');

  await bench.getByText('Show the chart as a table').click();
  await bench.getByText('By claim set').click();
  await expect(bench.getByRole('region', { name: 'The support score alone, by threshold' })).toBeVisible();
  await axe(page, 'lab benchmark tables open');

  // Every scroll region can be reached and scrolled by keyboard.
  for (const region of await bench.locator('[role=region][tabindex="0"]').all()) await expect(region).toHaveAttribute('tabindex', '0');

  await page.setViewportSize({ width: 375, height: 800 });
  await noSideways(page, 'lab at 375 px');
  await axe(page, 'lab benchmark at 375 px');

  await bench.getByRole('button', { name: 'Go to the live checks' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Run live checks' })).toBeFocused();

  expect(asked, 'nothing is looked up or downloaded until a button is pressed').toEqual([]);
  expect(errors).toEqual([]);
});

/**
 * A FAKE stand-in for both on-device models, for the next test only. It answers in the worker's own message
 * format, so the page runs as with the real models, and nothing is downloaded. Its numbers are made up, so this
 * test checks how the comparison runs and reads, never what it finds.
 */
async function fakeModels(page: Page) {
  await page.addInitScript(() => {
    const Real = window.Worker;
    const vec = (t: string) => [/%|percent/i.test(t) ? 1 : 0, /rose|increase|raised|improved|halved|decreased|fell/i.test(t) ? 1 : 0, 0.05];
    class FakeModels {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onerror: (() => void) | null = null;
      dead = false;
      constructor(url: URL | string, opts?: WorkerOptions) {
        if (!String(url).includes('support.worker')) return new Real(url, opts) as unknown as FakeModels;
      }
      postMessage(m: any) {
        setTimeout(() => this.answer(m), 5);
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
          const backs = /\d/.test(m.premise) && /\d/.test(m.hypothesis);
          say({ type: 'score', id: m.id, entails: backs ? 0.95 : 0.05, neutral: 0.04, contradicts: 0.01 });
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

test('lab: words against meaning, with FAKE on-device models', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = watchErrors(page);
  await fakeModels(page);
  await mockRegistries(page);
  await page.goto('/#/lab');
  const box = page.getByRole('region', { name: 'Finding the sentence: by words or by meaning' });
  await expect(box.getByText(/about 113 MB downloaded once/)).toBeVisible();
  await box.getByRole('button', { name: 'Compare on this device' }).click();
  await expect(box.getByText('Measured on this device just now.')).toBeVisible({ timeout: 30_000 });
  const table = box.getByRole('region', { name: 'Hits by how the sentences were picked' });
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(table).toContainText(/\d+ of 24/);
  await box.getByText('Each claim').click();
  await expect(box.getByRole('region', { name: 'Hits for each claim' }).getByRole('row')).toHaveCount(25);
  await axe(page, 'lab retrieval result');

  await box.getByRole('button', { name: 'Turn off and free the memory' }).click();
  await expect(box.getByRole('button', { name: 'Compare again' })).toBeVisible();
  await expect(box.getByRole('button', { name: 'Turn off and free the memory' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
