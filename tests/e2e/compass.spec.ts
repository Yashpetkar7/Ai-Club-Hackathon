import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { mockRegistries, watchErrors } from './mock';

const abstract = JSON.parse(readFileSync('tests/unit/fixtures/abstracts.json', 'utf8'))['10.1093/qje/qju032'] as string;

test('study uses real recorded text, saves progress, and never grants citation approval', async ({ page }) => {
  await mockRegistries(page);
  const errors = watchErrors(page);
  await page.goto('/#/projects');
  const ids = await page.evaluate(async (text) => {
    // These imports exercise the actual application store; all input is visibly test data.
    // @ts-expect-error Vite serves this application module in the browser.
    const actions = await import('/src/store/actions.ts');
    const project = await actions.createProject('SAMPLE browser test: working from home', 'apa', 0);
    const source = await actions.addSource(project.id, 'manual', { raw: { raw: 'SAMPLE recorded-text study test', title: 'SAMPLE recorded-text study test' } });
    await actions.editSource(source.id, { text, textOrigin: 'abstract' });
    return { projectId: project.id, sourceId: source.id };
  }, abstract);
  await page.goto(`/#/p/${ids.projectId}/learn`);
  await expect(page.getByRole('heading', { name: 'Study studio' })).toBeVisible();
  await page.getByLabel('My own words').fill('This study asks whether working from home changes employee performance.');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByRole('button', { name: 'Use this passage' }).first().click();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByLabel('My own words').fill('The specific workplace and sample limit how widely I can generalise the result.');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByRole('heading', { name: 'Try retrieval first' })).toBeVisible();
  await page.getByLabel('My answer from memory').fill('The study investigated home working and performance in a specific workplace; I should check its sample before generalising.');
  await page.getByRole('button', { name: 'Reveal source and compare' }).click();
  await page.getByRole('button', { name: 'Review again tomorrow' }).click();
  await expect(page.getByText('4 of 4 steps recorded')).toBeVisible();
  await page.reload();
  await expect(page.getByText('4 of 4 steps recorded')).toBeVisible();
  const source = await page.evaluate(async (id) => {
    // @ts-expect-error Vite serves this application module in the browser.
    const { db } = await import('/src/store/db.ts');
    return db.sources.get(id);
  }, ids.sourceId);
  expect(source.keys.approved).toBe(false);
  expect(source.keys.checked).toBe(false);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
  await page.goto(`/#/p/${ids.projectId}/compass`);
  await expect(page.getByRole('heading', { name: 'Your research compass' })).toBeVisible();
  expect(errors).toEqual([]);
});
