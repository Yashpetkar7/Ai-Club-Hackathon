import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { watchErrors } from './mock';

/**
 * The Guardrails page against the real dev server: its own /api/ai and /api/health answer, nothing is mocked.
 * Every check runs real code on SAMPLE inputs; no registry or model is asked.
 */
const axe = async (page: Page, name: string) => {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => `${name}: ${v.id} ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const noSideways = async (page: Page, name: string) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), name).toBeLessThanOrEqual(1);
const ROWS = 10;
/** A result stamp by its words. The mark in front of the words is decoration. */
const stamp = (scope: Locator, words: string) => scope.locator('.stamp', { hasText: words });

function watchRequests(page: Page): { ai: string[]; outside: string[] } {
  const seen = { ai: [] as string[], outside: [] as string[] };
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname === '/api/ai') seen.ai.push(r.method());
    if (u.pathname === '/api/registry' || /crossref|openalex|datacite|doi\.org|huggingface/.test(u.hostname)) seen.outside.push(r.url());
  });
  return seen;
}

test('guardrails: nothing runs before the click, then every check matches in the dev server', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = watchErrors(page);
  const seen = watchRequests(page);
  await page.goto('/#/guardrails');
  await expect(page.getByRole('heading', { name: 'Guardrails', level: 1 })).toBeVisible();
  const live = page.getByRole('region', { name: 'Guardrails, run live' });
  const status = live.getByRole('status');
  await expect(status).toHaveText(`Nothing has run yet. ${ROWS} checks are ready.`);
  const rows = live.getByRole('list', { name: 'Guardrails' }).getByRole('listitem').filter({ has: page.getByRole('heading', { level: 3 }) });
  await expect(rows).toHaveCount(ROWS);
  await expect(stamp(live, 'Matches the deck')).toHaveCount(0);
  await expect(stamp(live, 'Not run yet')).not.toHaveCount(0);
  // Expected results are stated before anything runs.
  await expect(rows.filter({ hasText: 'Changed evidence log' })).toContainText('Broken at entry 2');
  await page.waitForTimeout(300);
  expect(seen.ai).toEqual([]);
  await axe(page, 'guardrails before the run');

  await live.getByRole('button', { name: 'Run every check' }).click();
  await expect(status).toHaveText(`All ${ROWS} checks match what the deck says.`, { timeout: 30_000 });
  await expect(stamp(live, 'Matches the deck')).toHaveCount(ROWS);
  await expect(stamp(live, 'Does not match')).toHaveCount(0);
  await expect(stamp(live, 'Could not run')).toHaveCount(0);
  await expect(stamp(live, 'Not run yet')).toHaveCount(0);
  // The server check really asked our own server, once.
  expect(seen.ai).toEqual(['POST']);
  const level = rows.filter({ hasText: 'checked by the server' });
  await expect(level).toContainText('Refused: locked (HTTP 403)');
  // The stated limit of the log is shown as a limit, never as protection.
  await expect(stamp(rows.filter({ hasText: 'Changed evidence log' }), 'The stated limit')).toHaveCount(2);
  await expect(live.getByRole('button', { name: 'Run every check again' })).toBeVisible();

  // What runs where: read from the code, with the server's own answer about its AI key.
  const where = page.getByRole('region', { name: 'What runs where' });
  await expect(where.getByRole('region', { name: 'On-device models' })).toContainText('d8c86521100d3556476a063fc2342036d45c106f');
  await expect(where.getByRole('region', { name: 'On-device models' })).toContainText('Not pinned');
  await expect(where.getByText('Not confirmed', { exact: true })).toBeVisible();
  await expect(where.getByRole('region', { name: 'AI tasks and the lowest level for each' }).getByRole('row')).toHaveCount(5);
  await expect(where).not.toContainText('Asking this site’s server');
  await expect(where).not.toContainText('Differs from the server');

  // Model cards: numbers worked out from the Lab's data, with the caveat.
  const cards = page.getByRole('region', { name: 'Model cards' });
  await expect(cards).toContainText(/False claims labelled Verified: \d+ of \d+/);
  await expect(cards).toContainText('ROC curve');
  await expect(cards).toContainText('development set');

  const map = page.getByRole('region', { name: 'How this maps to published frameworks' });
  await expect(map).toContainText('Our own mapping. Not a certification, audit or compliance claim.');
  await expect(map.getByRole('link', { name: 'LLM01:2025 Prompt Injection' }).first()).toHaveAttribute('href', 'https://genai.owasp.org/llmrisk/llm01-prompt-injection/');
  await expect(page.locator('main')).not.toContainText(/\bfake\b/i);
  await axe(page, 'guardrails after the run');
  expect(seen.outside).toEqual([]);

  await cards.getByRole('link', { name: 'See every miss in the Integrity Lab' }).click();
  await expect(page.getByRole('heading', { name: 'Every miss' })).toBeFocused({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('guardrails at 375 px, by keyboard only', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/#/guardrails');
  await expect(page.getByRole('heading', { name: 'Guardrails', level: 1 })).toBeVisible();
  expect((await page.locator('header').first().boundingBox())!.height).toBeLessThan(96);
  await noSideways(page, 'guardrails at 375');
  const run = page.getByRole('button', { name: 'Run every check' });
  for (let i = 0; i < 40 && !(await run.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(run).toBeFocused();
  await page.keyboard.press('Enter');
  const live = page.getByRole('region', { name: 'Guardrails, run live' });
  await expect(live.getByRole('status')).toHaveText(`All ${ROWS} checks match what the deck says.`, { timeout: 30_000 });
  // Focus stays on the button, which now offers to run again.
  await expect(page.getByRole('button', { name: 'Run every check again' })).toBeFocused();
  const detail = live.getByText('What the code returned').first();
  await detail.focus();
  await page.keyboard.press('Enter');
  await expect(live.locator('details[open]').first()).toBeVisible();
  await noSideways(page, 'guardrails at 375 after the run');
  await axe(page, 'guardrails at 375');
});

test('house rules, the Lab, the palette and the More menu all open the page', async ({ page }) => {
  await page.goto('/#/rules');
  await page.getByRole('link', { name: 'See every guardrail run live' }).click();
  await expect(page.getByRole('heading', { name: 'Guardrails', level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/#\/guardrails$/);

  await page.goto('/#/lab');
  await page.getByRole('link', { name: 'see every guardrail run live' }).click();
  await expect(page.getByRole('heading', { name: 'Guardrails', level: 1 })).toBeVisible();

  await page.goto('/#/check');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('guardrails');
  await expect(page.getByRole('listbox', { name: 'Results' }).getByRole('option', { selected: true })).toContainText('Guardrails');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Guardrails', level: 1 })).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/#/check');
  await page.getByText('More', { exact: true }).click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Guardrails', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Guardrails', level: 1 })).toBeVisible();
  expect((await page.locator('header').first().boundingBox())!.height).toBeLessThan(96);
});
