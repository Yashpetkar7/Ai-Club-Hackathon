import { createElement } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PAGE_PLACES, PROJECT_WORDS, projectHome, projectPath } from '@/app/places';
import { HELPERS, MAIN } from '@/app/ProjectShell';
import { HereNext, Trail } from '@/app/Trail';
import { firstFix } from '@/pages/Signposts';

afterEach(cleanup);

const approved = { approvedAt: '2026-11-26T00:00:00.000Z', queries: ['remote work productivity'] };
const src = (o: { approved?: boolean; text?: string; verdict?: 'confirmed' | 'retracted' } = {}) => ({
  keys: { found: true, checked: true, approved: !!o.approved },
  check: o.verdict ? ({ verdict: o.verdict } as never) : undefined,
  text: o.text,
});

describe('where a project opens', () => {
  it('opens on Plan until the plan is approved, then on Compass', () => {
    expect(projectHome({})).toBe('plan');
    expect(projectHome({ plan: approved } as never)).toBe('compass');
    expect(projectPath({ id: 'x1', plan: approved } as never)).toBe('/p/x1/compass');
    expect(projectPath({ id: 'x1' })).toBe('/p/x1/plan');
  });
});

describe('palette words', () => {
  it('has words for every step and helper, and nothing more', () => {
    const keys = [...MAIN, ...HELPERS].map((s) => s.key).sort();
    expect(Object.keys(PROJECT_WORDS).sort()).toEqual(keys);
  });

  it('never lists the hidden owner panel', () => {
    for (const p of PAGE_PLACES) expect(`${p.to} ${p.label} ${p.words}`).not.toMatch(/owner/i);
  });

  it('finds the pages people ask for by the words they use', () => {
    const find = (w: string) => PAGE_PLACES.filter((p) => `${p.label} ${p.words}`.toLowerCase().includes(w)).map((p) => p.to);
    expect(find('paragraph')[0]).toBe('/audit');
    expect(find('polished')).toEqual(['/audit']);
    expect(find('accuracy')).toEqual(['/lab']);
    expect(find('metrics')).toEqual(['/lab']);
    expect(find('by meaning')[0]).toBe('/audit');
    expect(PROJECT_WORDS.evidence).toContain('by meaning');
  });
});

describe('the one button out of an empty page', () => {
  const project = { id: 'p1' };
  it('sends an empty library to Plan, or to Find once the plan is approved', () => {
    expect(firstFix(project, [])?.to).toBe('/p/p1/plan');
    expect(firstFix({ ...project, plan: approved } as never, [])?.to).toBe('/p/p1/find');
  });
  it('sends unapproved or retracted sources to Library, and sources without text to Read', () => {
    expect(firstFix(project, [src({ text: 'x' })], ['approved'])?.to).toBe('/p/p1/library');
    expect(firstFix(project, [src({ approved: true, verdict: 'retracted', text: 'x' })], ['approved'])?.to).toBe('/p/p1/library');
    expect(firstFix(project, [src({ approved: true, text: '  ' })], ['approved', 'text'])?.to).toBe('/p/p1/read');
  });
  it('shows nothing when nothing is missing', () => {
    expect(firstFix(project, [src()])).toBeNull();
    expect(firstFix(project, [src({ approved: true, verdict: 'confirmed', text: 'A sentence.' })], ['approved', 'text'])).toBeNull();
  });
});

describe('the trail', () => {
  const done = { plan: true, find: true, library: false, evidence: false };
  it('puts each helper under its step, with its hint, and marks the open helper', () => {
    render(createElement(Trail, { projectId: 'p1', main: MAIN, helpers: HELPERS, here: 'read', done, count: 2 }));
    // The second list with this name is the phone copy, which CSS hides on a wide screen.
    const [library, phone] = screen.getAllByRole('list', { name: 'Helpers for Library' });
    expect(phone).toBeTruthy();
    expect(within(library!).getAllByRole('link').map((a) => a.textContent)).toEqual(['Study studio', 'Read', 'Map']);
    const read = within(library!).getByRole('link', { name: 'Read' });
    expect(read.getAttribute('aria-current')).toBe('page');
    expect(read.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(read.getAttribute('aria-describedby')!)?.textContent).toBe('Method, findings, limits');
    expect(within(screen.getAllByRole('list', { name: 'Helpers for Evidence' })[0]!).getAllByRole('link').map((a) => a.textContent)).toEqual(['Ask', 'Challenge']);
    expect(within(screen.getByRole('list', { name: 'Whole project' })).getAllByRole('link').map((a) => a.textContent)).toEqual(['Compass', 'Team']);
    expect(screen.getByRole('link', { name: /^Library \(2\)/ }).closest('li')?.hasAttribute('data-open')).toBe(true);
  });

  it('says where you are and the next step in order, and stays quiet on Compass', () => {
    const { unmount } = render(createElement(HereNext, { projectId: 'p1', main: MAIN, helpers: HELPERS, here: 'plan', done: {} }));
    const nav = screen.getByRole('navigation', { name: 'Where you are' });
    expect(nav.textContent).toContain('Step 1 of 6');
    expect(nav.textContent).toContain('You open gate 1 here.');
    expect(within(nav).getByRole('link').getAttribute('href')).toBe('#/p/p1/find');
    unmount();
    render(createElement(HereNext, { projectId: 'p1', main: MAIN, helpers: HELPERS, here: 'challenge', done: {} }));
    expect(screen.getByRole('navigation', { name: 'Where you are' }).textContent).toContain('a helper for step 4, Evidence');
    cleanup();
    const { container } = render(createElement(HereNext, { projectId: 'p1', main: MAIN, helpers: HELPERS, here: 'compass', done: {} }));
    expect(container.innerHTML).toBe('');
  });
});
