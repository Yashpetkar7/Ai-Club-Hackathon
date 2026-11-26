import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { validateRecordedSample } from '../../src/core/lab/sample.ts';

const artifact = JSON.parse(readFileSync(new URL('../../src/core/lab/sample-run.json', import.meta.url), 'utf8'));
test('recorded Lab evidence matches the current checker and preserves missing replay coverage', async () => {
  const saved = await validateRecordedSample(artifact);
  for (const [path, digest] of Object.entries(saved.payload.sourceHashes)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(`../../${path}`, import.meta.url))).digest('hex'), digest, path);
  }
  assert.equal(saved.payload.run.mode, 'sample');
  assert.equal(saved.payload.registryCapturedAt, null);
  assert.equal(saved.payload.run.rows.length, 24);
  assert.equal(saved.payload.run.rows.filter((r) => r.missingReplay.length).length, 8);
  assert.equal(Object.isFrozen(saved.payload.run.rows), true);
});
test('edited Lab evidence and a rehashed live relabelling are refused', async () => {
  const edited = structuredClone(artifact);
  edited.payload.run.rows[0].check.verdict = 'not-found';
  await assert.rejects(validateRecordedSample(edited), /hash does not match/);
  const relabelled = structuredClone(artifact);
  relabelled.payload.run.mode = 'live';
  relabelled.sha256 = createHash('sha256').update(JSON.stringify(relabelled.payload)).digest('hex');
  await assert.rejects(validateRecordedSample(relabelled), /labelled SAMPLE/);
});
