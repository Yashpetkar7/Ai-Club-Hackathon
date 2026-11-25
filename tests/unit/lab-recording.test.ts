// @vitest-environment node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { ReferenceCheck } from '@/core/contracts';
import { CORPUS_MANIFEST, LAB_CORPUS } from '@/core/lab/corpus';
import { summarizeFamilies } from '@/core/lab/evaluate';
import type { LabRow, LabRun } from '@/core/lab/runner';
import { registries } from '@/core/registries';
import { checkReference } from '@/core/verify/verdict';
import { installReplay } from './replay';

const target = 'src/core/lab/sample-run.json';
const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
const nativeNow = Date.now.bind(Date);
const now = () => new Date(nativeNow()).toISOString();
const nativeFetch = globalThis.fetch;
const missing = new Set<string>();
const sourceFiles = [
  'src/core/verify/verdict.ts', 'src/core/verify/compare.ts', 'src/core/verify/normalise.ts',
  'src/core/registries/index.ts', 'src/core/registries/http.ts', 'src/core/registries/map.ts',
  'src/policy/policy.ts', 'src/core/lab/corpus.ts', 'src/core/lab/recorded-seeds.json',
  'tests/unit/replay.ts', 'tests/unit/fixtures/registry.json',
];

beforeAll(() => {
  if (process.env.RECORD === '1') throw new Error('This capture replays existing responses; it must not record or modify the shared fixture.');
  installReplay();
  const replayFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    try { return await replayFetch(input, init); }
    catch (error) {
      if (error instanceof Error && error.message.startsWith('not recorded: ')) missing.add(error.message.slice('not recorded: '.length));
      throw error;
    }
  };
});
afterAll(() => { globalThis.fetch = nativeFetch; vi.useRealTimers(); });

const checkContent = (check?: ReferenceCheck) => check ? {
  ...check,
  checkedAt: 'execution timestamp excluded from reproducibility comparison',
  trace: check.trace.map(({ ms: _simulated, ...trace }) => trace),
} : undefined;

it('reproduces the stored SAMPLE from the real checker and the existing replay without filling gaps', async () => {
  const startedAt = now();
  const rows: LabRow[] = [];
  vi.useFakeTimers();
  try {
    for (const c of LAB_CORPUS) {
      missing.clear();
      const rowStartedAt = now();
      try {
        // Actual wall time is supplied separately; retry waits use the simulated timer.
        const pending = checkReference(c.reference, registries, now);
        await vi.runAllTimersAsync();
        const check = await pending;
        rows.push({ case: c, state: 'completed', startedAt: rowStartedAt, finishedAt: now(), check, missingReplay: [...missing] });
      } catch (error) {
        rows.push({ case: c, state: 'error', startedAt: rowStartedAt, finishedAt: now(), error: error instanceof Error ? error.message : 'No checker result', missingReplay: [...missing] });
      }
    }
  } finally { vi.useRealTimers(); }

  const run: LabRun = { id: `recorded-replay-${startedAt}`, mode: 'sample', corpusVersion: CORPUS_MANIFEST.version, status: 'completed', startedAt, finishedAt: now(), rows };
  const payload = {
    kind: 'recorded-replay',
    recordedAt: now(),
    registryCapturedAt: null,
    timing: 'simulated-retry-clock',
    corpusHash: hash(JSON.stringify(LAB_CORPUS)),
    sourceHashes: Object.fromEntries(sourceFiles.map((f) => [f, hash(readFileSync(f))])),
    run,
  };
  const artifact = { sha256: hash(JSON.stringify(payload)), payload };
  if (process.env.LAB_WRITE_SAMPLE === '1') writeFileSync(target, JSON.stringify(artifact, null, 2) + '\n');
  expect(existsSync(target), 'Generate the owned sample with LAB_WRITE_SAMPLE=1; never invent a result file.').toBe(true);
  const saved = JSON.parse(readFileSync(target, 'utf8')) as typeof artifact;
  expect(saved.sha256).toBe(hash(JSON.stringify(saved.payload)));
  expect(saved.payload.kind).toBe('recorded-replay');
  expect(saved.payload.registryCapturedAt).toBeNull();
  expect(saved.payload.timing).toBe('simulated-retry-clock');
  expect(saved.payload.corpusHash).toBe(payload.corpusHash);
  expect(saved.payload.sourceHashes).toEqual(payload.sourceHashes);
  expect(saved.payload.run.rows.map((r) => r.case)).toEqual(LAB_CORPUS);
  expect(saved.payload.run.rows.map((r) => ({ case: r.case.id, state: r.state, check: checkContent(r.check), missingReplay: r.missingReplay, error: r.error })))
    .toEqual(rows.map((r) => ({ case: r.case.id, state: r.state, check: checkContent(r.check), missingReplay: r.missingReplay, error: r.error })));
  expect(rows).toHaveLength(24);
  expect(rows.filter((r) => r.missingReplay?.length)).toHaveLength(8);
  console.info('LAB_RECORDED_SAMPLE', JSON.stringify({ generated: process.env.LAB_WRITE_SAMPLE === '1', recordedAt: saved.payload.recordedAt, registryCapturedAt: null, sha256: saved.sha256, families: summarizeFamilies(rows) }));
});
