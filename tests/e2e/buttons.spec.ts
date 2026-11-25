import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mockRegistries } from './mock';

/**
 * Clicks every button, link, tick box, menu and fold on every page, each on a fresh copy of a filled project,
 * and fails if any of them does nothing at all. Slow, so run it on purpose:
 *   AUDIT=1 npx playwright test tests/e2e/buttons.spec.ts
 */
test.skip(process.env.AUDIT !== '1', 'slow: run with AUDIT=1');
test.setTimeout(45 * 60_000);

const ABSTRACT: Record<string, string> = JSON.parse(readFileSync('tests/unit/fixtures/abstracts.json', 'utf8'));
const step = (page: Page, name: string | RegExp) => page.getByLabel('Your trail').getByRole('link', { name }).click();

async function prepare(page: Page): Promise<string> {
  await mockRegistries(page);
  await page.goto('/#/projects');
  await page.getByLabel('What are you researching?').fill('Does working from home improve employee performance?');
  await page.getByText('Challenge my draft', { exact: true }).click();
  await page.getByRole('button', { name: 'Start project' }).click();
  await page.getByRole('button', { name: 'Approve plan and search' }).click();
  await expect(page.getByText(/works found/)).toBeVisible({ timeout: 60_000 });
  await step(page, /Library/);
  for (const [i, d] of ['10.1093/qje/qju032', '10.1126/science.adh2586', '10.1086/261763'].entries()) {
    if (i) await page.getByRole('button', { name: 'Add a source' }).click();
    await page.getByLabel('DOI, DOI link or title').fill(d);
    await page.getByRole('button', { name: 'Check and add', exact: true }).click();
    await expect(page.getByText(new RegExp(`of ${i + 1} ready to cite`))).toBeVisible({ timeout: 20_000 });
    if (i < 2) await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await page.waitForTimeout(200);
  }
  const id = page.url().match(/\/p\/([^/]+)/)![1]!;
  // Put the real abstracts in, as the Get the abstract button would.
  await page.evaluate(async (abs) => {
    const path = '/src/store/db.ts';
    const { db } = await import(/* @vite-ignore */ path);
    for (const s of await db.sources.toArray()) if (abs[s.record?.doi]) await db.sources.update(s.id, { text: abs[s.record.doi], textOrigin: 'abstract', tags: ['rct'], folder: 'Field' });
  }, ABSTRACT);
  await step(page, 'Evidence');
  await page.getByLabel('Your claim').fill('Home working led to a 13% performance increase.');
  await page.getByRole('combobox', { name: 'Source', exact: true }).selectOption({ label: 'Does Working from Home Work? Evidence from a Chinese Experiment' });
  await page.getByLabel('Your claim').fill('Home working led to a 13% performance increase.');
  await page.getByRole('button', { name: 'Find the sentence' }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await step(page, 'Write');
  await page.getByLabel('Your draft').fill('Home working led to a 13% performance increase (Bloom et al., 2015). Trust falls over time (Okonjo, 2022).');
  await expect(page.getByText('saved on this device')).toBeVisible();
  await page.waitForTimeout(400);
  return id;
}

const CONTROLS = 'button:visible, a[href]:visible, summary:visible, select:visible, input[type=checkbox]:visible, input[type=radio]:visible';

async function act(page: Page, n: number): Promise<{ name: string; did: string }> {
  const el = page.locator(CONTROLS).nth(n);
  const info = await el.evaluate((e) => ({
    tag: e.tagName,
    type: (e as HTMLInputElement).type ?? '',
    href: e.getAttribute('href') ?? '',
    blank: e.getAttribute('target') === '_blank',
    rel: e.getAttribute('rel') ?? '',
    off: (e as HTMLButtonElement).disabled === true,
    current: e.hasAttribute('aria-current'),
    checked: (e as HTMLInputElement).checked === true,
    name: (e.getAttribute('aria-label') || (e.tagName === 'SELECT' || e.tagName === 'INPUT' ? (e.closest('label')?.textContent ?? e.id) : e.textContent) || '').trim().replace(/\s+/g, ' ').slice(0, 60),
  }));
  const name = `${info.tag.toLowerCase()} "${info.name}"`;
  if (info.off) return { name, did: 'disabled for now' };
  if (info.blank) return { name, did: /^https:\/\//.test(info.href) && /noreferrer/.test(info.rel) ? 'opens a source in a new tab' : 'BAD outside link' };
  if (/^https?:/.test(info.href) && !info.blank) return { name, did: 'opens a source' };
  if (info.current) return { name, did: 'this is the page you are on' };
  if (info.type === 'radio' && info.checked) return { name, did: 'already chosen' };
  await page.evaluate(() => {
    const w = window as any;
    w.__did = [];
    const say = (s: string) => w.__did.push(s);
    new MutationObserver((m) => m.length && say('changed the page')).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    window.addEventListener('hashchange', () => say('went to another page'));
    window.addEventListener('scroll', () => say('scrolled'), { passive: true });
    document.addEventListener('focusin', () => say('moved focus'));
    document.addEventListener('toggle', () => say('opened or closed'), true);
    const orig = window.fetch;
    window.fetch = (...a) => { say('asked a registry'); return orig(...a); };
    if (navigator.clipboard) navigator.clipboard.writeText = async () => say('copied');
  });
  let extra = '';
  page.once('download', () => (extra = 'saved a file'));
  if (info.tag === 'SELECT') {
    const opts = await el.locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
    const now = await el.inputValue();
    const other = opts.find((o) => o !== now);
    if (other === undefined) return { name, did: 'only one choice for now' };
    await el.selectOption(other);
    if ((await el.inputValue().catch(() => other)) === other) extra ||= 'changed the choice';
  } else if (info.type === 'checkbox' || info.type === 'radio') {
    await el.click({ force: true, timeout: 4000 });
    extra ||= 'ticked';
  } else await el.click({ timeout: 6000 });
  await page.waitForTimeout(450);
  if (!extra) extra = await page.evaluate(() => ((window as any).__did as string[])[0] ?? '').catch(() => 'went to another page');
  if (!extra) {
    await page.waitForTimeout(1500);
    extra ||= await page.evaluate(() => ((window as any).__did as string[])[0] ?? '').catch(() => 'went to another page');
  }
  return { name, did: extra || 'NOTHING' };
}

test('every control on every page does something', async ({ browser, page }) => {
  const id = await prepare(page);
  const state = await page.context().storageState({ indexedDB: true });
  const routes = ['/', '/home', '/projects', '/check', '/lab', '/rules', '/account', '/signin', ...['team', 'plan', 'find', 'library', 'read', 'map', 'evidence', 'challenge', 'ask', 'write', 'review', 'export'].map((s) => `/p/${id}/${s}`)];
  const open = async (): Promise<{ ctx: BrowserContext; p: Page; errors: string[] }> => {
    const ctx = await browser.newContext({ storageState: state, baseURL: 'http://127.0.0.1:5199', viewport: { width: 1366, height: 900 } });
    const p = await ctx.newPage();
    const errors: string[] = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await mockRegistries(p);
    return { ctx, p, errors };
  };
  const bad: string[] = [];
  const seen = new Map<string, string>();
  let total = 0;
  for (const r of routes) {
    const ready = async (p: Page) => {
      await p.goto(`/#${r}`);
      await p.waitForSelector(r === '/' ? 'h1' : 'main h1', { timeout: 20_000 });
      await p.waitForTimeout(r === '/' ? 900 : 350);
      if (r.endsWith('/library')) { await p.locator('main ul > li > button').first().click(); await p.waitForTimeout(150); }
    };
    const first = await open();
    await ready(first.p);
    const n = await first.p.locator(CONTROLS).count();
    await first.ctx.close();
    for (let i = 0; i < n; i++) {
      // The bar at the top is the same everywhere: check it on one page only.
      const { ctx, p, errors } = await open();
      try {
        await ready(p);
        const inBar = await p.locator(CONTROLS).nth(i).evaluate((e) => !!e.closest('header') && !e.closest('main'));
        if (inBar && r !== '/home' && r !== '/') continue;
        const { name, did } = await act(p, i);
        total++;
        seen.set(`${r.replace(id, ':id')} ${name} #${i}`, did);
        if (/NOTHING|BAD/.test(did)) bad.push(`${r.replace(id, ':id')}: ${name} -> ${did}`);
        if (errors.length) bad.push(`${r.replace(id, ':id')}: ${name} -> error ${errors[0]}`);
      } catch (e) {
        bad.push(`${r.replace(id, ':id')}: control ${i} -> ${String(e).split('\n')[0]}`);
      } finally {
        await ctx.close();
      }
    }
    console.log(`${r.replace(id, ':id')}: ${n} controls`);
  }
  const kinds: Record<string, number> = {};
  for (const d of seen.values()) kinds[d] = (kinds[d] ?? 0) + 1;
  console.log(`${total} controls used. ${JSON.stringify(kinds)}`);
  if (bad.length) console.log(bad.join('\n'));
  expect(bad).toEqual([]);
});
