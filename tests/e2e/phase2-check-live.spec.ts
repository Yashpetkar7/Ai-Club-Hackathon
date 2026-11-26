import { expect, test } from '@playwright/test';
import { PACK } from '../phase2-pack';

/** The demo's opening step, live: all eight test-pack references pasted into Check at once.  LIVE=1 npx playwright test tests/e2e/phase2-check-live.spec.ts */
test.skip(process.env.LIVE !== '1', 'Live databases only: LIVE=1');
test.setTimeout(180_000);

test('Check: the test-pack references pasted at once; the web page added in the Library', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pt-session', 'guest'));
  await page.goto('/#/check');
  await page.getByPlaceholder('Paste here').fill(Object.values(PACK).join('\n'));
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  // A bulk paste does not pick up the bare web-page line (H) as a reference: 7 of 8 are read.
  await expect(page.getByText('7 references checked')).toBeVisible({ timeout: 150_000 });
  for (const t of ['3 verified', '1 needs fix', '1 mismatch', '1 retracted', '1 not found']) await expect(page.locator('.stamp', { hasText: t })).toBeVisible();
  await page.screenshot({ path: 'docs/qa/phase2-9-check-seven.png', fullPage: true });
  // H on its own in the Library: a web source, NOT CHECKED, in APA 7 with the organisation as author.
  await page.goto('/#/projects');
  await page.getByLabel('What are you researching?').fill('Web source check');
  await page.getByText('No AI', { exact: true }).click();
  await page.getByRole('button', { name: 'Start project' }).click();
  await page.getByLabel('Your trail').getByRole('link', { name: /^Library/ }).click();
  await page.getByLabel('DOI, DOI link or title').fill(PACK.H);
  await page.getByRole('button', { name: 'Check and add', exact: true }).click();
  await expect(page.getByText(/Web source, APA 7: World Health Organization\. \(n\.d\.\)\. Mental health\. https:\/\/www\.who\.int/)).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: 'docs/qa/phase2-10-web-source.png', fullPage: true });
});
