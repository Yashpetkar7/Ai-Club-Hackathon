import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockRegistries, watchErrors } from './mock';

const axe = async (page: Page, name: string) => {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => `${name}: ${v.id} ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const noSideways = async (page: Page, name: string) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), name).toBeLessThanOrEqual(1);
const trail = (page: Page) => page.getByLabel('Your trail');
const QUESTION = 'SAMPLE navigation test: does remote work change productivity?';

/** A new project through the page, as a student makes one. It opens on Plan. */
async function newProject(page: Page): Promise<string> {
  await page.goto('/#/projects');
  await page.getByLabel('What are you researching?').fill(QUESTION);
  await page.getByRole('button', { name: 'Start project' }).click();
  await expect(page.getByRole('heading', { name: 'Plan the search' })).toBeVisible();
  return page.url().split('/p/')[1]!.split('/')[0]!;
}
/** Runs the app's own store actions in the browser. Every value here is visibly test data. */
const act = (page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(async ([name, list]) => {
    // @ts-expect-error Vite serves this application module in the browser.
    const actions = await import('/src/store/actions.ts');
    return actions[name as string](...(list as unknown[]));
  }, [fn, args] as const);
const approve = (page: Page, id: string) => act(page, 'approvePlan', id, { queries: ['remote work productivity'] });

/** Opens the palette, types, and presses Enter. The keyboard only. */
async function palette(page: Page, words: string, first: string | RegExp) {
  await page.keyboard.press('Control+k');
  const box = page.getByRole('combobox', { name: /Find a page/ });
  await expect(box).toBeFocused();
  await page.keyboard.type(words);
  await expect(page.getByRole('listbox', { name: 'Results' }).getByRole('option', { selected: true })).toContainText(first);
  await page.keyboard.press('Enter');
  await expect(box).toBeHidden();
}

test('palette: every page of a project and every main page, found by the words people use', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await mockRegistries(page);
  const id = await newProject(page);
  const inProject: [string, string, string, string][] = [
    ['overview', 'Compass', 'compass', 'Your research compass'],
    ['agents', 'Team', 'team', 'The team'],
    ['queries', 'Plan', 'plan', 'Plan the search'],
    ['registries', 'Find', 'find', 'Find sources'],
    ['folders', 'Library', 'library', 'Library'],
    ['recall', 'Study studio', 'learn', 'Study studio'],
    ['findings', 'Read', 'read', 'Read and compare'],
    ['network', 'Map', 'map', 'Map'],
    ['by meaning', 'Evidence', 'evidence', 'Evidence'],
    ['answer', 'Ask', 'ask', 'Ask your library'],
    ['opposite', 'Challenge', 'challenge', 'Challenge a claim'],
    ['quotation', 'Write', 'write', 'Write'],
    ['marker', 'Review', 'review', 'Review'],
    ['bibliography', 'Export', 'export', 'Export'],
  ];
  for (const [words, label, key, heading] of inProject) {
    await palette(page, words, label);
    await expect(page).toHaveURL(new RegExp(`#/p/${id}/${key}$`));
    await expect(page.getByRole('heading', { name: heading, exact: true, level: 1 })).toBeVisible();
  }
  await axe(page, 'a project page');
  const pages: [string, string, string, string][] = [
    ['polished', 'Audit a paragraph', 'audit', 'Audit a paragraph'],
    ['paragraph', 'Audit a paragraph', 'audit', 'Audit a paragraph'],
    ['accuracy', 'Integrity Lab', 'lab', 'Integrity Lab'],
    ['metrics', 'Integrity Lab', 'lab', 'Integrity Lab'],
    ['doi', 'Check references', 'check', 'Check references'],
    ['house', 'House rules', 'rules', 'House rules'],
    ['how it works', 'How it works', 'guide', 'How it works'],
  ];
  for (const [words, label, path, heading] of pages) {
    await palette(page, words, label);
    await expect(page).toHaveURL(new RegExp(`#/${path}$`));
    await expect(page.getByRole('heading', { name: heading, exact: true, level: 1 })).toBeVisible();
  }
  // Outside a project, the project itself opens where it starts.
  await palette(page, 'navigation test', QUESTION);
  await expect(page.getByRole('heading', { name: 'Plan the search' })).toBeVisible();

  // The hidden owner panel is listed nowhere.
  await page.keyboard.press('Control+k');
  await page.keyboard.type('owner');
  await expect(page.getByText('Nothing matches that.')).toBeVisible();
  await page.keyboard.press('Escape');
  for (const path of ['/#/lab', '/#/guide', '/#/check', `/#/p/${id}/compass`]) {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('a[href*="owner"]')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('a project opens on Plan, then on Compass once the plan is approved, from every way in', async ({ page }) => {
  const errors = watchErrors(page);
  await mockRegistries(page);
  const id = await newProject(page);
  await page.goto('/#/projects');
  await page.getByRole('link', { name: new RegExp(QUESTION.slice(0, 30)) }).click();
  await expect(page).toHaveURL(new RegExp(`#/p/${id}/plan$`));
  await approve(page, id);
  await page.goto('/#/projects');
  await page.getByRole('link', { name: new RegExp(QUESTION.slice(0, 30)) }).click();
  await expect(page).toHaveURL(new RegExp(`#/p/${id}/compass$`));
  await expect(page.getByRole('heading', { name: 'Your research compass' })).toBeVisible();
  await expect(trail(page).getByRole('link', { name: 'Compass', exact: true })).toHaveAttribute('aria-current', 'page');
  // Compass makes its own suggestion, so the "where you are" line stays out of its way.
  await expect(page.getByRole('navigation', { name: 'Where you are' })).toHaveCount(0);
  await page.goto('/#/home');
  await page.getByRole('link', { name: QUESTION, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/p/${id}/compass$`));
  // A bare project address opens the same page.
  await page.goto(`/#/p/${id}`);
  await expect(page.getByRole('heading', { name: 'Your research compass' })).toBeVisible();
  await page.goto(`/#/p/${id}/plan`);
  await page.keyboard.press('Control+k');
  await page.keyboard.type('navigation test');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`#/p/${id}/compass$`));
  expect(errors).toEqual([]);
});

test('empty pages: one button, and it leads to the page that fixes it', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await mockRegistries(page);
  const id = await newProject(page);
  const fix = (name: string) => page.locator('main').getByRole('link', { name, exact: true });

  // No plan and no sources: every reading page offers Plan.
  for (const key of ['evidence', 'ask', 'read', 'learn', 'map', 'challenge']) {
    await page.goto(`/#/p/${id}/${key}`);
    await expect(fix('Plan your searches'), key).toBeVisible();
    await expect(fix('Plan your searches')).toHaveAttribute('href', `#/p/${id}/plan`);
  }
  await axe(page, 'challenge, empty library');
  await page.goto(`/#/p/${id}/evidence`);
  await axe(page, 'evidence, empty library');
  await fix('Plan your searches').click();
  await expect(page.getByRole('heading', { name: 'Plan the search' })).toBeVisible();

  // Plan approved, library still empty: Find.
  await approve(page, id);
  await page.goto(`/#/p/${id}/read`);
  await fix('Find sources').click();
  await expect(page.getByRole('heading', { name: 'Find sources' })).toBeVisible();

  // A source nobody has approved: Ask needs approved sources, so Library.
  const source = (await act(page, 'addSource', id, 'manual', { raw: { raw: 'SAMPLE navigation test source', title: 'SAMPLE navigation test source' } })) as { id: string };
  await page.goto(`/#/p/${id}/ask`);
  await expect(page.getByText('You have no approved sources yet.')).toBeVisible();
  await fix('Approve sources in Library').click();
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();

  // Approved, but no text to read: Read.
  await act(page, 'approveSource', source.id, 'Test only: kept so the page has an approved source with no text.');
  await page.goto(`/#/p/${id}/ask`);
  await axe(page, 'ask, no text');
  await fix('Get the text in Read').click();
  await expect(page.getByRole('heading', { name: 'Read and compare' })).toBeVisible();

  // Once there is text, the button goes away.
  await act(page, 'editSource', source.id, { text: 'SAMPLE test sentence about remote work and productivity.', textOrigin: 'abstract' });
  await page.goto(`/#/p/${id}/ask`);
  await expect(page.getByRole('heading', { name: 'Ask your library' })).toBeVisible();
  await expect(fix('Get the text in Read')).toHaveCount(0);

  // Cross-links: Check and Evidence to Audit, and the Lab's numbers to the live checks.
  await page.goto(`/#/p/${id}/evidence`);
  await page.locator('main').getByRole('link', { name: 'Audit a whole paragraph' }).click();
  await expect(page.getByRole('heading', { name: 'Audit a paragraph', level: 1 })).toBeVisible();
  await page.goto('/#/check');
  await page.locator('main').getByRole('link', { name: 'Audit a whole paragraph' }).click();
  await expect(page.getByRole('heading', { name: 'Audit a paragraph', level: 1 })).toBeVisible();
  await page.goto('/#/lab');
  await expect(page.locator('main').getByRole('link', { name: 'Audit a paragraph', exact: true })).toHaveAttribute('href', '#/audit', { timeout: 20_000 });
  await expect(page.locator('main').getByRole('link', { name: 'Check references', exact: true })).toHaveAttribute('href', '#/check');
  expect(errors).toEqual([]);
});

test('the trail: helpers under their step with their hints, the open page marked, by keyboard and at 375 px', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await mockRegistries(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const id = await newProject(page);
  await page.goto(`/#/p/${id}/read`);
  await expect(page.getByRole('heading', { name: 'Read and compare' })).toBeVisible();

  const library = trail(page).getByRole('list', { name: 'Helpers for Library' });
  await expect(library.getByRole('link')).toHaveText(['Study studio', 'Read', 'Map']);
  await expect(library.getByText('Method, findings, limits')).toBeVisible();
  await expect(library.getByRole('link', { name: 'Read', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(trail(page).getByRole('list', { name: 'Helpers for Evidence' }).getByRole('link')).toHaveText(['Ask', 'Challenge']);
  await expect(trail(page).getByRole('list', { name: 'Helpers for Write' }).getByRole('link')).toHaveText(['Review']);
  await expect(trail(page).getByRole('list', { name: 'Whole project' }).getByRole('link')).toHaveText(['Compass', 'Team']);
  await expect(trail(page).getByText('Your research overview and next step')).toBeVisible();

  const here = page.getByRole('navigation', { name: 'Where you are' });
  await expect(here).toContainText('Read is a helper for step 3, Library.');
  await axe(page, 'trail on a helper');

  // Keyboard only: Tab to Map in the trail, then Enter.
  await page.locator('main h1').focus();
  await page.keyboard.press('Shift+Tab');
  let found = false;
  for (let i = 0; i < 60 && !found; i++) {
    found = await page.evaluate(() => document.activeElement?.textContent === 'Map' && !!document.activeElement.closest('[aria-label="Your trail"]'));
    if (!found) await page.keyboard.press('Shift+Tab');
  }
  expect(found).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`#/p/${id}/map$`));
  await expect(page.getByRole('heading', { name: 'Map', exact: true, level: 1 })).toBeVisible();

  await here.getByRole('link', { name: 'Back to step 3, Library' }).click();
  await expect(page).toHaveURL(new RegExp(`#/p/${id}/library$`));
  await expect(here).toContainText('Step 3 of 6');
  await here.getByRole('link', { name: /Next: step 4, Evidence/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/p/${id}/evidence$`));
  await expect(here).toContainText('You open gate 3 here.');

  // A phone: the steps in one row, and the open step's helpers under it, with their hints.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/#/p/${id}/challenge`);
  await expect(page.getByRole('heading', { name: 'Challenge a claim' })).toBeVisible();
  const phone = trail(page).getByRole('list', { name: 'Helpers for Evidence' });
  await expect(phone).toHaveCount(1);
  await expect(phone.getByRole('link')).toHaveText(['Ask', 'Challenge']);
  await expect(phone.getByText('Look for the other side')).toBeVisible();
  await expect(phone.getByRole('link', { name: 'Challenge' })).toHaveAttribute('aria-current', 'page');
  await expect(trail(page).getByRole('link', { name: /^Evidence/ })).toBeInViewport();
  await noSideways(page, 'challenge at 375');
  await axe(page, 'trail at 375');
  expect((await page.locator('header').first().boundingBox())!.height).toBeLessThan(96);

  // The phone menu reaches the same places as the wide one.
  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const name of ['Home', 'Projects', 'Check', 'Audit']) await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
  await page.getByText('More', { exact: true }).click();
  for (const name of ['How it works', 'Integrity Lab', 'House rules']) await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.keyboard.type('accuracy');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Integrity Lab', level: 1 })).toBeVisible();
  expect((await page.locator('header').first().boundingBox())!.height).toBeLessThan(96);
  await noSideways(page, 'lab at 375');
  expect(errors).toEqual([]);
});

test('how it works: the new section on checking sentences, in plain words, at 375 px', async ({ page }) => {
  await mockRegistries(page);
  await page.goto('/#/guide');
  const part = page.getByRole('region', { name: 'Checking what a sentence says' });
  for (const h of ['Audit a paragraph', 'Find by meaning', 'The claim scorecard', 'Reading the Lab’s accuracy numbers']) await expect(part.getByRole('heading', { name: h })).toBeVisible();
  // The lines come from the policy in the code.
  await expect(part).toContainText('Support line, 90%.');
  await expect(part).toContainText('Contradiction line, 90%.');
  await expect(part).toContainText('it never gives a label');
  await expect(part).not.toContainText(/fake/i);
  await axe(page, 'guide with the new section');
  await part.getByRole('link', { name: 'Open the Integrity Lab' }).click();
  await expect(page.getByRole('heading', { name: 'Integrity Lab', level: 1 })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/#/guide');
  await expect(part).toBeVisible();
  await noSideways(page, 'guide at 375');
});
