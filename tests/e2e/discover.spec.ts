import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Route } from '@playwright/test';
import { mockRegistries, watchErrors } from './mock';

/** Real OpenAlex and Crossref answers recorded on 2026-11-26 (tests/unit/fixtures/discover.json). */
const { answers } = JSON.parse(readFileSync('tests/unit/fixtures/discover.json', 'utf8')) as { answers: Record<string, { status: number; body: any }> };
const recorded = (part: string) => Object.entries(answers).find(([u]) => u.includes(part))![1].body;
const MEANING = recorded('search.semantic=does%20remote%20work%20change%20productivity&per-page=10');
const WORDS = recorded('search=does%20remote%20work%20change%20productivity');
const RELATED = recorded('related_to:W4289449379');
const RETRACTED = recorded('is_retracted:true');
const EMPTY = recorded('search=qzxv');
const QUESTION = 'SAMPLE discover test: does remote work change productivity?';

const axe = async (page: Page, name: string) => {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => `${name}: ${v.id} ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const noSideways = async (page: Page, name: string) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), name).toBeLessThanOrEqual(1);
const target = (r: Route): string => new URL(r.request().url()).searchParams.get('url') ?? '';

type Answer = { status: number; json: unknown; headers?: Record<string, string> } | 'wait';
interface Lanes { meaning?: Answer; words?: Answer; crossref?: Answer }

/**
 * Discover's own questions, answered from the recordings; every other registry call falls back to tests/e2e/mock.ts.
 * Also records every registry address the page asks for, so a test can prove nothing was fetched.
 */
async function discoverRoutes(page: Page, lanes: Lanes = {}) {
  const asked: string[] = [];
  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  const respond = async (r: Route, url: string, direct: boolean) => {
    asked.push(url);
    // The registries answer the student's own browser with these headers, as OpenAlex does.
    const cors = direct ? { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'Retry-After' } : {};
    const send = async (a: Answer) => {
      if (a === 'wait') {
        await held;
        a = { status: 200, json: MEANING };
      }
      return r.fulfill({ status: a.status, json: a.json, headers: { 'content-type': 'application/json', ...cors, ...a.headers } });
    };
    if (url.includes('search.semantic=')) return send(lanes.meaning ?? { status: 200, json: MEANING });
    if (url.startsWith('https://api.openalex.org/works?search=')) return send(lanes.words ?? { status: 200, json: WORDS });
    if (url.startsWith('https://api.crossref.org/works?') && lanes.crossref) return send(lanes.crossref);
    if (url.includes('filter=related_to:W4289449379')) return send({ status: 200, json: RELATED });
    const exact = answers[url];
    if (exact) return send({ status: exact.status, json: exact.body });
    // A registry address nobody recorded is never asked for real.
    return direct ? send({ status: 503, json: { error: 'not recorded' } }) : r.fallback();
  };
  await mockRegistries(page);
  await page.route('**/api/registry?*', (r) => respond(r, target(r), false));
  // After a 429 from our server the page tries the student's own connection, so those addresses are answered here too.
  await page.route(/^https:\/\/api\.(openalex|crossref)\.org\//, (r) => respond(r, r.request().url(), true));
  return { asked, release };
}

const act = (page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(async ([name, list]) => {
    // @ts-expect-error Vite serves this application module in the browser.
    const actions = await import('/src/store/actions.ts');
    return actions[name as string](...(list as unknown[]));
  }, [fn, args] as const);

async function newProject(page: Page): Promise<string> {
  await page.goto('/#/projects');
  await page.getByLabel('What are you researching?').fill(QUESTION);
  await page.getByRole('button', { name: 'Start project' }).click();
  await expect(page.getByRole('heading', { name: 'Plan the search' })).toBeVisible();
  return page.url().split('/p/')[1]!.split('/')[0]!;
}

const part = (page: Page, name: string) => page.getByRole('region', { name });
const result = (page: Page, where: string, title: RegExp) => part(page, where).getByRole('listitem').filter({ has: page.getByRole('heading', { name: title }) });

test('Discover: nothing fetched before Search, each result says how it was found, adding goes through the checker and waits for approval, then more like this', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  const { asked } = await discoverRoutes(page);
  const id = await newProject(page);
  await act(page, 'approvePlan', id, { queries: ['remote work productivity'] });
  // The palette reaches it by the words a student uses. Plan asks no registry anything, so counting starts here.
  await page.goto(`/#/p/${id}/plan`);
  await expect(page.getByRole('heading', { name: 'Plan the search' })).toBeVisible();
  asked.length = 0;
  await page.keyboard.press('Control+k');
  await page.keyboard.type('similar');
  await expect(page.getByRole('listbox', { name: 'Results' }).getByRole('option', { selected: true })).toContainText('Discover');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`#/p/${id}/discover$`));

  await expect(page.getByRole('heading', { name: 'Discover', level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Where you are' })).toContainText('Discover is a helper for step 2, Find.');
  const helpers = page.getByLabel('Your trail').getByRole('list', { name: 'Helpers for Find' }).first();
  await expect(helpers.getByRole('link', { name: 'Discover' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Nothing on this page can be cited by itself.')).toBeVisible();
  const meaning = part(page, 'Search by meaning');
  await expect(meaning.getByLabel('Your question')).toHaveValue(QUESTION);
  await expect(meaning.getByRole('status')).toHaveText('Nothing is searched until you press Search.');
  const like = part(page, 'More like this');
  await expect(like.getByText('Your library is empty.')).toBeVisible();
  await expect(like.getByRole('link', { name: 'Find sources' })).toBeVisible();
  await axe(page, 'discover before a search');
  // Nothing at all has been asked of a registry: the student has not pressed Search.
  expect(asked).toEqual([]);

  // By keyboard: Enter in the question searches.
  await meaning.getByLabel('Your question').focus();
  await page.keyboard.press('Enter');
  await expect(meaning.getByRole('status')).toContainText('19 works for');
  await expect(meaning.getByRole('status')).toContainText('9 found by words, 9 by meaning, 1 by both');
  expect(asked.filter((u) => u.includes('search.semantic='))).toHaveLength(1);
  expect(asked.filter((u) => u.startsWith('https://api.openalex.org/works?search='))).toHaveLength(1);

  const items = meaning.getByRole('listitem');
  await expect(items).toHaveCount(19);
  const top = items.first();
  await expect(top.getByRole('heading', { level: 3 })).toContainText('The Rise of Remote Work');
  await expect(top).toContainText('Found by words and by meaning');
  await expect(top).toContainText('2024');
  await expect(top).toContainText('Journal of Economics & Management Strategy');
  await expect(top).toContainText('Open access');
  await top.getByText('Why it appears').click();
  await expect(top).toContainText('Place 6 in the search by words and place 3 in the search by meaning.');
  await expect(meaning.getByText('Found by meaning', { exact: true })).toHaveCount(9);
  await expect(meaning.getByText('No DOI listed', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/fake/i)).toHaveCount(0);
  await axe(page, 'discover with results');

  // Add one: the checker runs on recorded registry answers, and the source waits for the student's approval.
  const wfh = result(page, 'Search by meaning', /^Work from Home and Productivity: Evidence from Personnel/);
  await wfh.getByRole('button', { name: 'Add to library' }).click();
  await expect(wfh).toContainText('In your library, waiting for your approval');
  await expect(wfh.locator('.stamp')).toHaveText(/Confirmed/);
  await expect(wfh.getByRole('link', { name: 'Approve in Library' })).toBeVisible();
  const saved = await page.evaluate(async () => {
    // @ts-expect-error Vite serves these application modules in the browser.
    const { db } = await import('/src/store/db.ts');
    // @ts-expect-error Vite serves these application modules in the browser.
    const { citable } = await import('/src/store/actions.ts');
    const all = await db.sources.toArray();
    const log = await db.log.toArray();
    return { keys: all.map((s: any) => s.keys), origin: all.map((s: any) => s.origin), citable: all.map((s: any) => citable(s)), oa: all.map((s: any) => s.record?.openalexId), searched: log.filter((e: any) => e.action === 'scout.searched').map((e: any) => e.detail) };
  });
  expect(saved.keys).toEqual([{ found: true, checked: true, approved: false }]);
  expect(saved.origin).toEqual(['search']);
  expect(saved.citable).toEqual([false]);
  expect(saved.oa).toEqual(['W4289449379']);
  expect(saved.searched).toHaveLength(1);
  expect(saved.searched[0]).toMatch(/^Discover: "SAMPLE discover test/);

  // More like this: the added source has an OpenAlex id, so its related works can be listed.
  const before = asked.length;
  await expect(like.getByLabel('Your source')).toContainText('Work from Home and Productivity');
  await expect(like.getByRole('status')).toHaveText('Nothing is looked up until you press Show related works.');
  expect(asked.length).toBe(before);
  await like.getByRole('button', { name: 'Show related works' }).click();
  await expect(like.getByRole('status')).toHaveText('10 works OpenAlex lists as related.');
  const related = like.getByRole('listitem');
  await expect(related).toHaveCount(10);
  await expect(related.first()).toContainText('Economic Inquiry');
  await expect(related.first().getByText('Found by', { exact: false })).toHaveCount(0);
  await related.first().getByText('Why it appears').click();
  await expect(related.first()).toContainText('OpenAlex lists it as related to “Work from Home and Productivity');
  await expect(like.getByText('year not stated', { exact: false }).first()).toBeVisible();
  await axe(page, 'more like this');
  const logged = await page.evaluate(async () => {
    // @ts-expect-error Vite serves this application module in the browser.
    const { db } = await import('/src/store/db.ts');
    return (await db.log.toArray()).filter((e: any) => e.action === 'scout.searched').map((e: any) => e.detail);
  });
  expect(logged[1]).toMatch(/^Discover, more like this: Work from Home and Productivity.* \| 10 related works in OpenAlex$/);
  expect(errors).toEqual([]);
});

test('Discover states at 375 px: before a plan, loading, a used-up daily limit, a retraction, nothing found, no answer, offline', async ({ page, context }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 375, height: 812 });
  const hold = await discoverRoutes(page, { meaning: 'wait' });
  const id = await newProject(page);

  // Before the plan is approved, nothing can be searched.
  await page.goto(`/#/p/${id}/discover`);
  await expect(part(page, 'Search by meaning')).toContainText('Nothing is searched until you approve a plan.');
  await expect(part(page, 'Search by meaning').getByRole('link', { name: 'Go to the plan' })).toBeVisible();
  await noSideways(page, 'discover before a plan');
  await axe(page, 'discover before a plan at 375');
  await act(page, 'approvePlan', id, { queries: ['remote work productivity'] });

  // Loading: the search by meaning is held, so the page says it is searching and the button cannot be pressed twice.
  const meaning = part(page, 'Search by meaning');
  await meaning.getByRole('button', { name: 'Search' }).click();
  await expect(meaning.getByRole('status')).toHaveText('Searching by words and by meaning…');
  await expect(meaning.getByRole('button', { name: 'Searching…' })).toBeDisabled();
  hold.release();
  await expect(meaning.getByRole('status')).toContainText('19 works for');
  await noSideways(page, 'discover results at 375');

  // A used-up daily limit on the search by meaning: the words still answer, and the page says so.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await discoverRoutes(page, { meaning: { status: 429, json: {}, headers: { 'retry-after': '3600' } } });
  await page.reload();
  await meaning.getByRole('button', { name: 'Search' }).click();
  await expect(meaning.getByText('The search by meaning did not answer: OpenAlex says its free daily limit is used up.')).toBeVisible();
  await expect(meaning.getByText('These were found by words only.', { exact: false })).toBeVisible();
  await expect(meaning.getByRole('listitem')).toHaveCount(10);
  await expect(meaning.getByText('Found by words', { exact: true })).toHaveCount(10);
  await noSideways(page, 'partial at 375');
  await axe(page, 'partial at 375');

  // A work OpenAlex flags as retracted is shown with the flag.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await discoverRoutes(page, { meaning: { status: 200, json: RETRACTED }, words: { status: 200, json: EMPTY } });
  await page.reload();
  await meaning.getByRole('button', { name: 'Search' }).click();
  await expect(meaning.getByRole('listitem')).toHaveCount(2);
  await expect(meaning.getByText('OpenAlex marks this work as retracted.')).toHaveCount(2);

  // Nothing found by either search.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await discoverRoutes(page, { meaning: { status: 200, json: EMPTY }, words: { status: 200, json: EMPTY }, crossref: { status: 200, json: { message: { items: [] } } } });
  await page.reload();
  await meaning.getByRole('button', { name: 'Search' }).click();
  await expect(meaning.getByRole('status')).toHaveText('Nothing found.');
  await expect(meaning.getByText('We will not make one up.', { exact: false })).toBeVisible();

  // No answer from any registry is an error, never "nothing found".
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await discoverRoutes(page, { meaning: { status: 400, json: {} }, words: { status: 400, json: {} }, crossref: { status: 400, json: {} } });
  await page.reload();
  await meaning.getByRole('button', { name: 'Search' }).click();
  await expect(meaning.getByRole('alert')).toHaveText('Neither search answered. Nothing was found, and nothing was made up. Try again in a minute.');
  await expect(meaning.getByRole('status')).not.toContainText('Nothing found');
  await axe(page, 'error at 375');

  // Offline: the page says so and the search cannot start.
  await context.setOffline(true);
  await expect(page.getByText('You are offline. Searching needs a connection.')).toBeVisible();
  await expect(meaning.getByRole('button', { name: 'Search' })).toBeDisabled();
  await noSideways(page, 'offline at 375');
  await context.setOffline(false);
  await expect(meaning.getByRole('button', { name: 'Search' })).toBeEnabled();
  expect(errors).toEqual([]);
});
