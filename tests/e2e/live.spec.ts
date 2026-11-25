import { expect, test } from '@playwright/test';
import { watchErrors } from './mock';

// Talks to the real registries. Run on purpose:  LIVE=1 npx playwright test tests/e2e/live.spec.ts
test.skip(process.env.LIVE !== '1', 'live registries');

test('live: sample check and a real search', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('pt-session', 'guest'));
  await page.goto('/#/check');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.getByText('5 references checked')).toBeVisible({ timeout: 60_000 });
  for (const t of ['2 confirmed', '1 wrong paper', '1 retracted', '1 not found']) await expect(page.locator('.stamp', { hasText: t })).toBeVisible();
  await page.goto('/#/projects');
  await page.getByLabel('What are you researching?').fill('Does remote work improve employee productivity?');
  await page.getByRole('button', { name: 'Start project' }).click();
  await page.getByRole('button', { name: 'Approve plan and search' }).click();
  await expect(page.getByText(/works found/)).toBeVisible({ timeout: 100_000 });
  await page.getByRole('button', { name: 'Keep', exact: true }).first().click();
  await expect(page.getByText('In your library').first()).toBeVisible();
  console.log('FOUND:', await page.locator('[role=status] strong').first().innerText(), '| verdicts:', JSON.stringify(await page.locator('li .stamp').allInnerTexts()));
  await page.screenshot({ path: 'test-results/find-live.png' });
  expect(errors).toEqual([]);
});

test('live: retraction check, duplicates and missing papers with the real registries', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await page.addInitScript(() => localStorage.setItem('pt-session', 'guest'));
  await page.goto('/#/projects');
  await page.getByLabel('What are you researching?').fill('What do later papers make of withdrawn work?');
  await page.getByRole('button', { name: 'Start project' }).click();
  await page.getByLabel('Your trail').getByRole('link', { name: 'Library' }).click();
  // A 2023 review whose reference list holds a retracted 1998 paper, that 1998 paper itself, and three papers on home working.
  const dois = ['10.1053/j.gastro.2023.01.017', '10.1016/S0140-6736(97)11096-0', '10.1093/qje/qju032', '10.1086/721803', '10.1111/ntwe.12153'];
  for (const [i, d] of dois.entries()) {
    if (!(await page.getByLabel('DOI, DOI link or title').isVisible())) await page.getByRole('button', { name: 'Add a source' }).click();
    await page.getByLabel('DOI, DOI link or title').fill(d);
    await page.getByRole('button', { name: 'Check and add', exact: true }).click();
    await expect(page.getByText(new RegExp(`of ${i + 1} ready to cite`))).toBeVisible({ timeout: 40_000 });
  }
  const panel = page.getByRole('region', { name: 'Retraction check' });
  await panel.getByRole('button', { name: 'Check all for retractions' }).click();
  await expect(panel.getByText(/sources? checked/)).toBeVisible({ timeout: 120_000 });
  await expect(panel.getByText('Retracted (1)')).toBeVisible();
  await expect(panel.getByText('Cites retracted work (')).toBeVisible();
  console.log('WATCH:', (await panel.innerText()).replace(/\n+/g, ' | '));
  await page.locator('main ul > li > button').filter({ hasText: 'Crohn' }).click();
  await expect(page.getByLabel('Source details').getByText('This source cites')).toBeVisible();
  console.log('LEANS ON:', (await page.getByLabel('Source details').locator('ul').first().innerText()).replace(/\n+/g, ' | '));
  await page.getByLabel('Your trail').getByRole('link', { name: 'Map' }).click();
  const box = page.getByRole('region', { name: 'Papers you may be missing' });
  await expect(box).toBeVisible();
  if (await box.getByRole('button', { name: 'Show them' }).isVisible()) {
    await box.getByRole('button', { name: 'Show them' }).click();
    await expect(box.locator('li').first().or(box.getByText('Nothing to show'))).toBeVisible({ timeout: 40_000 });
    await page.waitForTimeout(6000);
  }
  console.log('MISSING:', (await box.innerText()).replace(/\n+/g, ' | ').slice(0, 1500));
  expect(errors).toEqual([]);
});
