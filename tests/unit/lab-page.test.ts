import { createElement, StrictMode } from 'react';
import { webcrypto } from 'node:crypto';
import { act, cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReferenceCheck } from '@/core/contracts';
import { Lab } from '@/pages/Lab';
import { checkReference } from '@/core/verify/verdict';
import * as sampleLoader from '@/core/lab/sample';
import * as benchmarkLoader from '@/core/lab/benchmark';
import recordedSample from '@/core/lab/sample-run.json';

vi.mock('@/core/verify/verdict', async (original) => ({ ...await original<typeof import('@/core/verify/verdict')>(), checkReference: vi.fn() }));
const check = vi.mocked(checkReference);
const actualRecordedCheck = recordedSample.payload.run.rows.find((r) => r.check?.verdict === 'confirmed')!.check as ReferenceCheck;
// The benchmark hashes and scores 104 claims before it renders. On a busy laptop that takes longer than
// Testing Library's one-second default, so this file waits up to 15 seconds.
configure({ asyncUtilTimeout: 15_000 });
const mount = () => render(createElement(StrictMode, null, createElement(Lab)));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
beforeEach(() => {
  check.mockReset();
  vi.stubGlobal('crypto', webcrypto);
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Integrity Lab interface', () => {
  it('does not query registries on mount and explains the fixed inputs and cache boundary', () => {
    mount();
    expect(check).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Integrity Lab' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Run live checks' })).toBeTruthy();
    expect(screen.getByText(/may reuse responses cached/i)).toBeTruthy();
    expect(screen.getAllByText('Invented for this Lab; do not cite').length).toBe(12);
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
  });

  it('runs and cancels with the keyboard while preserving unrun cases', async () => {
    const user = userEvent.setup();
    const pending = deferred<ReferenceCheck>();
    check.mockReturnValue(pending.promise);
    mount();
    const start = screen.getByRole('button', { name: 'Run live checks' });
    start.focus();
    await user.keyboard('{Enter}');
    expect(check).toHaveBeenCalledTimes(1);
    const cancel = screen.getByRole('button', { name: 'Cancel run' });
    cancel.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('status').textContent).toMatch(/cancelled/i);
    expect(screen.getByText(/in-flight requests may finish/i)).toBeTruthy();
    await act(async () => pending.resolve(actualRecordedCheck));
    expect(check).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toMatch(/0.*24/);
  });

  it('shows a labelled recorded sample, replay gaps and capture uncertainty without live calls', async () => {
    const user = userEvent.setup();
    mount();
    const sample = screen.getByRole('button', { name: 'View recorded sample' });
    sample.focus();
    await user.keyboard('{Enter}');
    await screen.findByText(/SAMPLE — recorded replay/i);
    expect(check).not.toHaveBeenCalled();
    expect(screen.getByText(/registry capture time is unknown/i)).toBeTruthy();
    expect(screen.getAllByText(/Missing replay coverage/).length).toBeGreaterThan(0);
    const region = screen.getByRole('region', { name: 'Results by family' });
    expect(region.tabIndex).toBe(0);
    expect(within(region).getByRole('table')).toBeTruthy();
    region.focus();
    expect(document.activeElement).toBe(region);
  });

  it('prevents duplicate starts and stops scheduling when navigation unmounts the page', async () => {
    const user = userEvent.setup();
    const pending = deferred<ReferenceCheck>();
    check.mockReturnValue(pending.promise);
    const view = mount();
    await user.dblClick(screen.getByRole('button', { name: 'Run live checks' }));
    expect(check).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => pending.resolve(actualRecordedCheck));
    expect(check).toHaveBeenCalledTimes(1);
  });

  it.each(['start', 'preserve', 'offline'] as const)('keeps keyboard focus usable after natural completion: %s', async (destination) => {
    const user = userEvent.setup();
    const pending = deferred<ReferenceCheck>();
    check.mockReturnValueOnce(pending.promise).mockResolvedValue(actualRecordedCheck);
    mount();
    const start = screen.getByRole('button', { name: 'Run live checks' });
    await user.click(start);
    const cancel = screen.getByRole('button', { name: 'Cancel run' });
    const sample = screen.getByRole('button', { name: 'View recorded sample' });
    cancel.focus();
    if (destination === 'preserve') sample.focus();
    if (destination === 'offline') {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      act(() => window.dispatchEvent(new Event('offline')));
    }
    await act(async () => pending.resolve(actualRecordedCheck));
    await waitFor(() => expect(check).toHaveBeenCalledTimes(24));
    expect(screen.queryByRole('button', { name: 'Cancel run' })).toBeNull();
    expect(document.activeElement).toBe(destination === 'start' ? start : sample);
  });

  it('ignores a cancelled run’s late response after a new run starts', async () => {
    const user = userEvent.setup();
    const old = deferred<ReferenceCheck>();
    const current = deferred<ReferenceCheck>();
    check.mockReturnValueOnce(old.promise).mockReturnValue(current.promise);
    mount();
    await user.click(screen.getByRole('button', { name: 'Run live checks' }));
    await user.click(screen.getByRole('button', { name: 'Cancel run' }));
    await user.click(screen.getByRole('button', { name: 'Run live checks' }));
    await act(async () => old.resolve(actualRecordedCheck));
    expect(check).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status').textContent).toMatch(/0.*24/);
    await user.click(screen.getByRole('button', { name: 'Cancel run' }));
    await act(async () => current.resolve(actualRecordedCheck));
  });

  it('cancels the queue before showing SAMPLE and restores the preserved partial live results', async () => {
    const user = userEvent.setup();
    const pending = deferred<ReferenceCheck>();
    check.mockResolvedValueOnce(actualRecordedCheck).mockReturnValue(pending.promise);
    mount();
    await user.click(screen.getByRole('button', { name: 'Run live checks' }));
    await waitFor(() => expect(check).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('status').textContent).toMatch(/1.*24/);
    await user.click(screen.getByRole('button', { name: 'View recorded sample' }));
    await screen.findByText(/SAMPLE — recorded replay/i);
    await act(async () => pending.resolve(actualRecordedCheck));
    expect(check).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('button', { name: 'Back to live results' }));
    expect(screen.getByRole('status').textContent).toMatch(/cancelled/i);
    expect(screen.getByRole('status').textContent).toMatch(/1.*24/);
    expect(screen.queryByText(/SAMPLE — recorded replay/i)).toBeNull();
  });

  it('shows a recording-load failure without substituting sample data or live results', async () => {
    const user = userEvent.setup();
    vi.spyOn(sampleLoader, 'loadSample').mockRejectedValueOnce(new Error('Recording integrity check failed'));
    mount();
    await user.click(screen.getByRole('button', { name: 'View recorded sample' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Recording integrity check failed/);
    expect(check).not.toHaveBeenCalled();
    expect(screen.queryByText(/SAMPLE — recorded replay/i)).toBeNull();
    expect((screen.getByRole('button', { name: 'View recorded sample' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('labels every recorded case and shows the actual compared fields and replay execution timestamp', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'View recorded sample' }));
    await screen.findByText(/SAMPLE — recorded replay/i);
    const cases = screen.getByRole('list', { name: 'All cases' });
    expect(within(cases).getAllByText('SAMPLE').length).toBe(24);
    expect(within(cases).getAllByText(/Checker ran in replay/).length).toBe(24);
    const measured = recordedSample.payload.run.rows.find((row) => row.check?.fields.some((field) => !field.ok))!;
    const item = within(cases).getByText(measured.case.reference.raw).closest('li')!;
    await user.click(within(item).getByText('Check trace and provenance'));
    const fields = within(item).getByLabelText('Compared fields');
    for (const field of measured.check!.fields) {
      expect(fields.textContent).toContain(field.given);
      expect(fields.textContent).toContain(field.registry);
      expect(fields.textContent).toContain(field.ok ? 'Matched' : 'Different');
    }
  });

  it('keeps partial-coverage confirmations visible while showing misses and the overlapping coverage count', async () => {
    const user = userEvent.setup();
    check.mockResolvedValue({
      ...actualRecordedCheck,
      trace: [...actualRecordedCheck.trace, { registry: 'openalex', status: 'error', ms: 0, note: 'Injected secondary lookup failure' }],
    });
    mount();
    await user.click(screen.getByRole('button', { name: 'Run live checks' }));
    await waitFor(() => expect(check).toHaveBeenCalledTimes(24));
    const cases = screen.getByRole('list', { name: 'All cases' });
    expect(within(cases).getAllByText('Confirmed').length).toBe(24);
    expect(within(cases).getAllByText(/Limited registry coverage/).length).toBe(24);
    const misses = screen.getByRole('region', { name: 'Misses and false alarms' });
    expect(within(misses).getAllByText(/Missed:/).length).toBe(12);
    expect(within(misses).getByText('Missed the known retraction')).toBeTruthy();
    expect(screen.getByText(/coverage-gap counts overlap/i)).toBeTruthy();
  });

  it('keeps thrown checks as errors instead of rendering manufactured verdicts', async () => {
    const user = userEvent.setup();
    check.mockRejectedValue(new Error('Injected checker exception'));
    mount();
    await user.click(screen.getByRole('button', { name: 'Run live checks' }));
    await waitFor(() => expect(check).toHaveBeenCalledTimes(24));
    expect(screen.getAllByText(/Injected checker exception/).length).toBe(24);
    expect(screen.queryByText('Confirmed')).toBeNull();
  });

  it('renders unknown verdicts neutrally without crashing or counting a success', async () => {
    const user = userEvent.setup();
    check.mockResolvedValue({ ...actualRecordedCheck, verdict: 'future-status' } as unknown as ReferenceCheck);
    mount();
    await user.click(screen.getByRole('button', { name: 'Run live checks' }));
    await waitFor(() => expect(check).toHaveBeenCalledTimes(24));
    expect(screen.getAllByText(/Unrecognised checker result/).length).toBe(24);
  });

  it('offers the recorded sample when the browser reports offline', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    mount();
    expect((screen.getByRole('button', { name: 'Run live checks' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'View recorded sample' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/browser reports.*offline/i)).toBeTruthy();
  });

  it('has no axe structural violations in the recorded-results state', async () => {
    const user = userEvent.setup();
    const { container } = mount();
    await user.click(screen.getByRole('button', { name: 'View recorded sample' }));
    await screen.findByText(/SAMPLE — recorded replay/i);
    await user.click(screen.getByText('Recording provenance'));
    await user.click(screen.getAllByText('Check trace and provenance')[0]!);
    await user.click(screen.getAllByText('Check trace and provenance')[8]!);
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.length }))).toEqual([]);
  });

  it('works out how accurate it is on load, states its limits and lists every miss, without any lookup', async () => {
    const user = userEvent.setup();
    const { container } = mount();
    const bench = screen.getByRole('region', { name: 'How accurate is it?' });
    expect(within(bench).getByText(/working out the numbers/i)).toBeTruthy();
    await within(bench).findByRole('heading', { name: 'Claim checker' });
    expect(check).not.toHaveBeenCalled();
    expect(bench.getAttribute('aria-busy')).toBe('false');
    expect(within(bench).getByText(/team wrote these 104 claims against 8 real abstracts/)).toBeTruthy();
    expect(within(bench).getByText(/Those 7 became rules, so this set is now a regression test/)).toBeTruthy();
    expect(within(bench).getByText(/not a comparison with any other product/)).toBeTruthy();
    const cards = within(within(bench).getByRole('list', { name: 'Claim checker numbers' })).getAllByRole('listitem');
    expect(cards[0]!.textContent).toMatch(/False claims labelled Verified.*0 of 80.*95% range 0% to 4\.6%/);
    expect(cards[1]!.textContent).toMatch(/True claims labelled Verified.*21 of 24/);
    const refs = within(within(bench).getByRole('list', { name: 'Reference checker numbers' })).getAllByRole('listitem');
    expect(refs[0]!.textContent).toMatch(/8 of 8.*without one as misses: 8 of 12/);
    expect(within(bench).getByRole('img', { name: /support score alone decided Verified/ })).toBeTruthy();
    expect(within(bench).getByRole('list', { name: 'Claim checker misses' }).children).toHaveLength(18);
    expect(within(bench).getByRole('list', { name: /Reference checker misses/ }).children).toHaveLength(9);
    await user.click(within(bench).getByText('Show the chart as a table'));
    await user.click(within(bench).getByText('By claim set'));
    expect(within(bench).getByRole('region', { name: 'The support score alone, by threshold' }).tabIndex).toBe(0);
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.length }))).toEqual([]);
  });

  it('says why when the recorded data does not check out, and the live checks still work', async () => {
    vi.spyOn(benchmarkLoader, 'loadBenchmark').mockRejectedValue(new Error('The claim benchmark data does not match its hash. No numbers were worked out.'));
    mount();
    expect(await screen.findByText(/does not match its hash/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Claim checker' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Run live checks' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('jumps to the live checks by keyboard', async () => {
    const user = userEvent.setup();
    mount();
    screen.getByRole('button', { name: 'Go to the live checks' }).focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Run live checks' }));
  });
});
