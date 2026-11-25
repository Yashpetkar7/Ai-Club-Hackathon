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
