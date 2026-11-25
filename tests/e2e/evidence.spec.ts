import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockRegistries, watchErrors } from './mock';

const axe = async (page: Page, name: string) => {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => `${name}: ${v.id} ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const noSideways = async (page: Page, name: string) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), name).toBeLessThanOrEqual(1);
const step = (page: Page, name: string | RegExp) => page.getByLabel('Your trail').getByRole('link', { name }).click();
const ABSTRACT: Record<string, string> = JSON.parse(readFileSync('tests/unit/fixtures/abstracts.json', 'utf8'));

/** Real abstracts put back into recorded OpenAlex records, which are stored without them. */
async function withAbstracts(page: Page) {
  await mockRegistries(page);
  const store = JSON.parse(readFileSync('tests/unit/fixtures/registry.json', 'utf8'));
  const dress = (w: any) => {
    const t = ABSTRACT[String(w.doi ?? '').replace('https://doi.org/', '')];
    return t ? { ...w, abstract_inverted_index: Object.fromEntries(Object.entries(Object.groupBy(t.split(' ').map((x, i) => [x, i] as const), ([x]) => x)).map(([k, v]) => [k, v!.map(([, i]) => i)])) } : w;
  };
  const works = Object.entries(store).filter(([u, r]: any) => u.startsWith('https://api.openalex.org/works/doi:') && r.status === 200).map(([, r]: any) => dress(r.body));
  await page.route(/\/api\/registry\?url=https%3A%2F%2Fapi\.openalex\.org/, (r) => {
    const url = new URL(r.request().url()).searchParams.get('url') ?? '';
    if (url.includes('/works?')) return r.fulfill({ json: { results: works } });
    const hit = store[url];
    return hit ? r.fulfill({ status: hit.status, json: hit.status === 200 ? dress(hit.body) : {} }) : r.fulfill({ status: 503, json: {} });
  });
}
async function library(page: Page, level: string, dois: string[]) {
  await page.goto('/#/projects');
  await page.getByLabel('What are you researching?').fill('Does working from home improve employee performance?');
  await page.getByText(level, { exact: true }).click();
  await page.getByRole('button', { name: 'Start project' }).click();
  await step(page, 'Library');
  for (const [i, d] of dois.entries()) {
    if (i === 1) await page.getByRole('button', { name: 'Add a source' }).click();
    await page.getByLabel('DOI, DOI link or title').fill(d);
    await page.getByRole('button', { name: 'Check and add', exact: true }).click();
    await expect(page.getByText(`${i} of ${i + 1} ready to cite`)).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByText(`${i + 1} of ${i + 1} ready to cite`)).toBeVisible();
  }
}

test('evidence: 13% is Verified, 31% fails, no AI and no network', async ({ page, context }) => {
  // Stamps fade in. Contrast is measured on the finished page.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = watchErrors(page);
  await withAbstracts(page);
  await library(page, 'No AI', ['10.1093/qje/qju032', '10.1126/science.adh2586']);
  await step(page, 'Evidence');
  await axe(page, 'evidence empty');

  // The recorded Crossref record has no abstract, so the page asks for one.
  const select = page.getByRole('combobox', { name: 'Source', exact: true });
  for (const name of ['Does Working from Home Work', 'Experimental evidence']) {
    const value = await select.locator('option', { hasText: name }).getAttribute('value');
    await select.selectOption(value!);
    const get = page.getByRole('button', { name: 'Get the abstract' });
    if (await get.isVisible()) await get.click();
    await expect(page.getByText('Only the abstract can be read.')).toBeVisible({ timeout: 15_000 });
  }
  const bloom = await select.locator('option', { hasText: 'Does Working from Home Work' }).getAttribute('value');
  await select.selectOption(bloom!);

  // Everything from here works with the network off, once the pages have been fetched in the background.
  await page.waitForFunction(() => performance.getEntriesByType('resource').some((r) => r.name.includes('locales-en-US')));
  await context.setOffline(true);
  const claim = page.getByLabel('Your claim');
  const result = page.getByLabel('Result');
  await claim.fill('Home working led to a 13% performance increase.');
  await page.getByRole('button', { name: 'Find the sentence' }).click();
  await expect(result.locator('.stamp')).toHaveText(/Verified$/);
  await expect(result.locator('mark')).toContainText('Home working led to a 13% performance increase, of which 9%');
  await expect(result.getByText('✓ word for word')).toBeVisible();
  await axe(page, 'evidence verified');
  await page.screenshot({ path: 'test-results/evidence-verified.png' });
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.getByText('Saved as Verified.')).toBeVisible();

  await claim.fill('Home working led to a 31% performance increase.');
  await page.getByRole('button', { name: 'Find the sentence' }).click();
  await expect(result.locator('.stamp')).toHaveText(/Disputed$/);
  await expect(result.getByText('A number does not match the source.')).toBeVisible();
  await axe(page, 'evidence disputed');
  await page.screenshot({ path: 'test-results/evidence-disputed.png' });
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.getByRole('alert')).toContainText('This is not Verified');
  await page.getByRole('button', { name: 'Reject' }).click();
  await expect(page.getByText('Rejected. It stays in the log.')).toBeVisible();

  await claim.fill('Penguins prefer colder offices in winter.');
  await page.getByRole('button', { name: 'Find the sentence' }).click();
  await expect(page.getByText('No sentence in this source is close to your claim.')).toBeVisible();
  await expect(result.locator('.stamp')).toHaveText(/Reported, not checked$/);

  // Paraphrase: Reported, with the model offered but never loaded by itself.
  await claim.fill('Working from home increased performance by 13%.');
  await page.getByRole('button', { name: 'Find the sentence' }).click();
  await expect(result.locator('.stamp')).toHaveText(/Reported, not checked$/);
  await expect(page.getByRole('button', { name: 'Compare the meaning' })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await noSideways(page, 'evidence');
  await page.setViewportSize({ width: 1280, height: 800 });

  // Ask, still offline
  await step(page, 'Ask');
  await page.getByLabel('Your question').fill('How did home working affect performance?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByLabel('Answer').locator('blockquote').first()).toContainText('13% performance increase');
  await axe(page, 'ask');
  await page.getByLabel('Your question').fill('What is the capital of Mongolia?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Not found in your library' })).toBeVisible();
  await axe(page, 'ask not found');
  await page.setViewportSize({ width: 375, height: 812 });
  await noSideways(page, 'ask');
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test('ask: the AI Reader can only point at our own sentences', async ({ page }) => {
  const errors = watchErrors(page);
  await withAbstracts(page);
  let asked: any = null;
  await page.route('**/api/ai', (r) => {
    asked = r.request().postDataJSON();
    return r.fulfill({ json: { ok: true, model: 'test-model', data: { passages: ['p1', 'p2', 'p999'] } } });
  });
  await library(page, 'Read and summarise', ['10.1093/qje/qju032']);
  await step(page, 'Evidence');
  const get = page.getByRole('button', { name: 'Get the abstract' });
  if (await get.isVisible()) await get.click();
  await expect(page.getByText('Only the abstract can be read.')).toBeVisible({ timeout: 15_000 });
  await step(page, 'Ask');
  await page.getByLabel('Your question').fill('What happened to attrition among home workers?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByText('Also pointed at by AI (test-model)')).toBeVisible();
  expect(asked.task).toBe('read');
  for (const q of await page.locator('blockquote').allTextContents()) expect(ABSTRACT['10.1093/qje/qju032']).toContain(q.replace(/^“|”$/g, ''));
  await page.getByRole('button', { name: 'Useful', exact: true }).first().click();
  await expect(page.getByText('Marked useful')).toBeVisible();
  await step(page, 'Export');
  await expect(page.getByLabel('AI-use statement').first()).toContainText('test-model');
  await expect(page.getByLabel('AI-use statement').first()).toContainText('kept 1, changed 0 and rejected 0');
  // Level 0: the Reader is locked and nothing is sent.
  asked = null;
  await page.getByLabel('AI allowed here').selectOption('0');
  await step(page, 'Ask');
  await page.getByLabel('Your question').fill('What happened to attrition among home workers?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByLabel('Answer').locator('blockquote').first()).toBeVisible();
  expect(asked).toBeNull();
  expect(errors).toEqual([]);
});
