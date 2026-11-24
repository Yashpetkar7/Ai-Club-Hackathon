import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockRegistries, watchErrors } from './mock';

const axe = async (page: Page, name: string) => {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => `${name}: ${v.id} ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};

test('landing: says what it is, checks a reference, and 3D is optional', async ({ page }) => {
  const errors = watchErrors(page);
  await mockRegistries(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('do not exist');
  await page.getByRole('button', { name: 'An invented DOI' }).click();
  await expect(page.locator('[data-verdict="not-found"]')).toContainText('This DOI does not exist', { timeout: 15_000 });
  await page.getByRole('button', { name: 'A hijacked DOI' }).click();
  await expect(page.locator('[data-verdict="wrong-paper"]')).toContainText('The Race between Man and Machine', { timeout: 15_000 });
  expect(errors).toEqual([]);

  await page.goto('/?nogl');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: '13%' }).click();
  await expect(page.getByText('Supported. The number')).toBeVisible();
  expect(errors).toEqual([]);
});

test('three.js is never downloaded on the working pages', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (r) => scripts.push(r.url()));
  await mockRegistries(page);
  await page.goto('/#/check');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForTimeout(800);
  expect(scripts.filter((u) => /\/three(\.|\/)|scene\.ts/.test(u))).toEqual([]);
});

test('check: the sample gets exactly the verdicts we promise', async ({ page }) => {
  const errors = watchErrors(page);
  const unknown = await mockRegistries(page);
  await page.goto('/#/check');
  await axe(page, 'check empty');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.getByText('5 references checked')).toBeVisible({ timeout: 30_000 });
  expect(unknown).toEqual([]);
  for (const t of ['2 confirmed', '1 wrong paper', '1 retracted', '1 not found']) await expect(page.locator('.stamp', { hasText: t })).toBeVisible();
  await expect(page.locator('.sample').first()).toBeVisible();
  await page.getByRole('button', { name: /ChatGPT in the classroom/ }).click();
  await expect(page.locator('article')).toContainText('Retracted on 2025-02-21');
  await axe(page, 'check results');
  expect(errors).toEqual([]);
});

test('journey: question, plan, gate 1, find, keep, library', async ({ page }) => {
  const errors = watchErrors(page);
  await mockRegistries(page);
  await page.goto('/#/projects');
  await axe(page, 'projects');
  await page.getByRole('button', { name: 'Start project' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('What are you researching?').fill('Does remote work improve employee productivity?');
  await page.getByText('No AI', { exact: true }).click();
  await page.getByRole('button', { name: 'Start project' }).click();
  await expect(page.getByRole('heading', { name: 'Plan the search' })).toBeVisible();
  await expect(page.getByLabel('Search 1', { exact: true })).toHaveValue('remote work improve employee productivity');
  await axe(page, 'plan');
  await page.getByRole('button', { name: 'Approve plan and search' }).click();
  await expect(page.getByRole('heading', { name: 'Find sources' })).toBeVisible();
  await expect(page.getByText(/works found/)).toBeVisible({ timeout: 45_000 });
  await axe(page, 'find');
  await page.getByRole('button', { name: 'Keep', exact: true }).first().click();
  await expect(page.getByText('In your library').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Library \(1\)/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: /Library \(1\)/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('phone width: nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockRegistries(page);
  for (const path of ['/?nogl', '/#/check', '/#/projects', '/#/rules', '/#/lab']) {
    await page.goto(path);
    await page.waitForTimeout(400);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, path).toBeLessThanOrEqual(1);
  }
});

test('dark theme keeps readable contrast', async ({ page }) => {
  await mockRegistries(page);
  await page.goto('/#/check');
  await page.getByRole('button', { name: 'Lights off' }).click();
  await axe(page, 'check dark');
});
