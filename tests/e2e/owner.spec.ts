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
const stored = (page: Page) => page.evaluate(() => [sessionStorage.getItem('pt-owner-ai-key'), localStorage.getItem('pt-owner-ai-key')]);
// Built at run time, so no key-shaped text is written in this file. Not a real key.
const KEY = ['gsk', 'E2e'.repeat(10)].join('_');

type Call = { header: string | null; body: any };
/** Stands in for our own /api/ai. Every answer here is a test stub, never shown as real output. */
async function mockAi(page: Page, calls: Call[], reply: { current: { status: number; json: unknown } }) {
  await page.route('**/api/ai', (r) => {
    calls.push({ header: r.request().headers()['x-owner-ai-key'] ?? null, body: r.request().postDataJSON() });
    return r.fulfill({ status: reply.current.status, json: reply.current.json });
  });
}

test('owner key: a hidden panel at #/lab?owner saves, tests and forgets a key, by keyboard and at 375 px', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = watchErrors(page);
  await mockRegistries(page);
  const calls: Call[] = [];
  const reply = { current: { status: 200, json: { ok: true, model: 'test-model (Groq)', owner: true, data: { queries: ['reference checking students'] } } as unknown } };
  await mockAi(page, calls, reply);

  // Plain #/lab: no panel, and nothing links to it.
  await page.goto('/#/lab');
  await expect(page.getByRole('heading', { name: 'Integrity Lab' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Owner AI key' })).toHaveCount(0);
  await expect(page.locator('a[href*="owner"]')).toHaveCount(0);

  await page.goto('/#/lab?owner');
  const panel = page.getByRole('region', { name: 'Owner AI key' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('No key is saved in this browser.')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Test the key' })).toBeDisabled();
  const field = panel.getByLabel('Groq API key');
  await expect(field).toHaveAttribute('type', 'password');
  await expect(field).toHaveAttribute('autocomplete', 'off');
  await expect(field).toHaveAttribute('spellcheck', 'false');
  await axe(page, 'owner panel, no key');

  // Something that is not a key is refused, and never shown back.
  await field.fill('my secret words');
  await field.press('Enter');
  await expect(panel.getByRole('alert')).toContainText('does not look like a Groq key');
  await expect(panel.getByRole('alert')).not.toContainText('my secret words');
  expect(await stored(page)).toEqual([null, null]);

  // Saved for this tab, by keyboard. Only the last 4 characters are shown, and the field is emptied.
  await field.fill(KEY);
  await field.press('Enter');
  await expect(panel.getByText(`A key ending in ${KEY.slice(-4)} is saved for this tab.`)).toBeVisible();
  await expect(field).toHaveValue('');
  expect(await stored(page)).toEqual([KEY, null]);
  expect(await page.content()).not.toContain(KEY);
  await expect(panel.getByRole('button', { name: 'Test the key' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('status')).toHaveText('The key works. Groq answered with test-model (Groq).');
  expect(calls).toHaveLength(1);
  expect(calls[0]!.header).toBe(KEY);
  expect(calls[0]!.body).toMatchObject({ task: 'plan', level: 1, input: { question: expect.any(String) } });
  expect(JSON.stringify(calls[0]!.body)).not.toContain(KEY);
  await axe(page, 'owner panel, key saved and tested');

  // A key Groq refuses is said plainly.
  reply.current = { status: 401, json: { ok: false, reason: 'key-rejected' } };
  await panel.getByRole('button', { name: 'Test the key' }).click();
  await expect(panel.getByRole('status')).toContainText('Groq refused this key.');

  // Remember on this device keeps it in local storage only; Forget takes it out of both.
  await panel.getByLabel('Remember on this device').check();
  await field.fill(KEY);
  await panel.getByRole('button', { name: 'Save on this device' }).click();
  await expect(panel.getByText(`A key ending in ${KEY.slice(-4)} is saved on this device.`)).toBeVisible();
  expect(await stored(page)).toEqual([null, KEY]);
  await panel.getByRole('button', { name: 'Forget the key' }).click();
  await expect(panel.getByText('No key is saved in this browser.')).toBeVisible();
  await expect(field).toBeFocused();
  expect(await stored(page)).toEqual([null, null]);

  await page.setViewportSize({ width: 375, height: 812 });
  await noSideways(page, 'owner panel at 375 px');
  await axe(page, 'owner panel at 375 px');
  expect(errors).toEqual([]);
});

const ABSTRACT: Record<string, string> = JSON.parse(readFileSync('tests/unit/fixtures/abstracts.json', 'utf8'));
/** Real abstracts put back into recorded OpenAlex records, as in evidence.spec.ts. */
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

test('explain: the AI puts a label into words at level 2, cannot change it, and is hidden at levels 0 and 1', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = watchErrors(page);
  await withAbstracts(page);
  const calls: Call[] = [];
  const reply = { current: { status: 200, json: { ok: true, model: 'test-model', data: { explanation: 'Your claim appears word for word in the source sentence, including 13%. Every plain-code check passed, so the label is Verified.' } } as unknown } };
  await mockAi(page, calls, reply);

  await page.goto('/#/projects');
  await page.getByLabel('What are you researching?').fill('Does working from home improve employee performance?');
  await page.getByText('Read and summarise', { exact: true }).click();
  await page.getByRole('button', { name: 'Start project' }).click();
  await step(page, 'Library');
  await page.getByLabel('DOI, DOI link or title').fill('10.1093/qje/qju032');
  await page.getByRole('button', { name: 'Check and add', exact: true }).click();
  await expect(page.getByText('0 of 1 ready to cite')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('1 of 1 ready to cite')).toBeVisible();
  await step(page, 'Evidence');
  const get = page.getByRole('button', { name: 'Get the abstract' });
  if (await get.isVisible()) await get.click();
  await expect(page.getByText('Only the abstract can be read.')).toBeVisible({ timeout: 15_000 });

  const claim = page.getByLabel('Your claim');
  const result = page.getByLabel('Result');
  const explain = result.getByRole('button', { name: 'Explain this label in plain words (AI)' });
  const box = result.getByRole('region', { name: 'AI explanation' });
  await claim.fill('Home working led to a 13% performance increase.');
  await page.getByRole('button', { name: 'Find the sentence' }).click();
  await expect(result.locator('.stamp')).toHaveText(/Verified$/);
  await expect(box).toHaveCount(0);
  await explain.click();
  await expect(box).toContainText('Every plain-code check passed');
  await expect(box).toContainText('From test-model. A suggestion. It does not change the label.');
  // The button is gone, so keyboard focus is on the answer, not lost on the page.
  await expect(box).toBeFocused();
  await expect(result.locator('.stamp')).toHaveText(/Verified$/);
  expect(calls).toHaveLength(1);
  expect(calls[0]!.header).toBeNull();
  expect(calls[0]!.body).toMatchObject({ task: 'explain', level: 2, input: { label: 'verified', claim: 'Home working led to a 13% performance increase.', checks: { inSource: true, wordForWord: true }, lines: { support: 90, contradiction: 90 } } });
  expect(calls[0]!.body.input.sentence).toContain('13% performance increase');
  await axe(page, 'evidence with an AI explanation');

  // A new claim starts again. An answer that names another label is not shown, and the label stands.
  reply.current = { status: 200, json: { ok: true, model: 'test-model', data: { explanation: 'With a closer number this would be Verified.' } } };
  await claim.fill('Home working led to a 31% performance increase.');
  await page.getByRole('button', { name: 'Find the sentence' }).click();
  await expect(result.locator('.stamp')).toHaveText(/Disputed$/);
  await expect(box).toHaveCount(0);
  await explain.click();
  await expect(result.getByText('The AI answer did not pass our checks, so it is not shown. The label above stands.')).toBeVisible();
  await expect(box).toHaveCount(0);
  await expect(result.locator('.stamp')).toHaveText(/Disputed$/);

  // Offline: the button waits for a connection.
  await context.setOffline(true);
  await expect(explain).toBeDisabled();
  await expect(result.getByText(/offline\. The AI explanation needs a connection/)).toBeVisible();
  await context.setOffline(false);
  await expect(explain).toBeEnabled();

  // With an owner key saved in this tab, the same call carries it as one header.
  await page.evaluate((k) => sessionStorage.setItem('pt-owner-ai-key', k), KEY);
  reply.current = { status: 200, json: { ok: true, model: 'test-model', data: { explanation: 'Your claim says 31%, but the source sentence says 13%, so the number check failed and the label is Disputed.' } } };
  await explain.click();
  await expect(box).toContainText('the number check failed');
  expect(calls.at(-1)!.header).toBe(KEY);
  await page.setViewportSize({ width: 375, height: 812 });
  await noSideways(page, 'evidence explanation at 375 px');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => sessionStorage.removeItem('pt-owner-ai-key'));

  // Levels 0 and 1 do not allow the Reader, so the button is not there.
  const sent = calls.length;
  for (const level of ['1', '0']) {
    await page.getByLabel('AI allowed here').selectOption(level);
    await expect(result.locator('.stamp')).toHaveText(/Disputed$/);
    await expect(explain).toHaveCount(0);
    await expect(box).toHaveCount(0);
  }
  await axe(page, 'evidence at level 0');
  expect(calls).toHaveLength(sent);
  expect(errors).toEqual([]);
});
