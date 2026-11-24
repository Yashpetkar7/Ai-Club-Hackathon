// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { record, verifyChain } from '@/log/log';
import { addSource, approveSource, citable, createProject } from '@/store/actions';
import { db } from '@/store/db';
import type { ReferenceCheck, RegistryRecord } from '@/core/contracts';

const rec: RegistryRecord = { registry: 'crossref', id: '10.1/x', doi: '10.1/x', title: 'A real paper', authors: [{ family: 'Noy' }], retracted: false };
const check = (verdict: ReferenceCheck['verdict']): ReferenceCheck => ({ verdict, reasons: [], record: rec, fields: [], trace: [], checkedAt: '2026-11-24T00:00:00Z' });

beforeEach(async () => {
  await Promise.all([db.log.clear(), db.sources.clear(), db.projects.clear()]);
});

describe('evidence log', () => {
  it('verifies an untouched chain and catches an edit', async () => {
    for (const d of ['one', 'two', 'three']) await record('p1', 'student', 'note', d);
    const ok = await db.log.where('projectId').equals('p1').sortBy('seq');
    expect(await verifyChain(ok)).toEqual({ ok: true, count: 3 });
    const edited = ok.map((e, i) => (i === 1 ? { ...e, detail: 'changed' } : e));
    expect(await verifyChain(edited)).toEqual({ ok: false, brokenAt: 2, count: 3 });
    expect((await verifyChain(ok.filter((_, i) => i !== 1))).ok).toBe(false);
  });
  it('keeps order when events arrive at the same time', async () => {
    await Promise.all(Array.from({ length: 12 }, (_, i) => record('p2', 'code', 'note', String(i))));
    expect(await verifyChain(await db.log.where('projectId').equals('p2').sortBy('seq'))).toEqual({ ok: true, count: 12 });
  });
});

describe('three keys', () => {
  it('a confirmed source still needs the student', async () => {
    const p = await createProject('Does remote work help?');
    const s = await addSource(p.id, 'check', { check: check('confirmed') });
    expect(s.keys).toEqual({ found: true, checked: true, approved: false });
    expect(citable(s)).toBe(false);
    expect(citable(await approveSource(s.id))).toBe(true);
  });
  it('a flagged source needs a written reason', async () => {
    const p = await createProject('Does remote work help?');
    const s = await addSource(p.id, 'check', { check: check('retracted') });
    await expect(approveSource(s.id)).rejects.toThrow(/at least 12/);
    await expect(approveSource(s.id, 'because')).rejects.toThrow(/at least 12/);
    const kept = await approveSource(s.id, 'I cite it as an example of a retracted paper');
    expect(kept.keys.checked).toBe(false);
    expect(kept.keptWithReason).toContain('example');
  });
  it('the same DOI is never added twice', async () => {
    const p = await createProject('q');
    await addSource(p.id, 'check', { check: check('confirmed') });
    await addSource(p.id, 'doi', { check: check('confirmed') });
    expect(await db.sources.where('projectId').equals(p.id).count()).toBe(1);
  });
});
