// @vitest-environment node
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { LAB_CORPUS } from '@/core/lab/corpus';
import sample from '@/core/lab/sample-run.json';
import { loadSample, validateRecordedSample } from '@/core/lab/sample';

it('loads an immutable SAMPLE with the whole case snapshot and honest timing provenance', async () => {
  const saved = await loadSample();
  expect(saved.payload.kind).toBe('recorded-replay');
  expect(saved.payload.run.mode).toBe('sample');
  expect(saved.payload.run.rows.map((r) => r.case)).toEqual(LAB_CORPUS);
  expect(saved.payload.registryCapturedAt).toBeNull();
  expect(saved.payload.timing).toBe('simulated-retry-clock');
  expect(Object.isFrozen(saved.payload.run.rows)).toBe(true);
  expect(Object.isFrozen(saved.payload.run.rows[0]!.check)).toBe(true);
});

it('refuses a modified artifact instead of calling it recorded evidence', async () => {
  const edited = structuredClone(sample);
  edited.payload.run.rows[0]!.case.reference.raw += ' changed';
  await expect(validateRecordedSample(edited)).rejects.toThrow(/hash|integrity/i);
});

it('refuses a different corpus even when its content hash is recomputed', async () => {
  const edited = structuredClone(sample);
  edited.payload.run.rows.pop();
  edited.sha256 = createHash('sha256').update(JSON.stringify(edited.payload)).digest('hex');
  await expect(validateRecordedSample(edited)).rejects.toThrow(/corpus|snapshot/i);
});

it('never accepts a replay relabelled as a live run', async () => {
  const edited = structuredClone(sample);
  edited.payload.run.mode = 'live';
  edited.sha256 = createHash('sha256').update(JSON.stringify(edited.payload)).digest('hex');
  await expect(validateRecordedSample(edited)).rejects.toThrow(/sample|replay/i);
});
