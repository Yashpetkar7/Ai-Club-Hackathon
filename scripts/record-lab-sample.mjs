// Re-runs the actual checker against the unchanged recorded registry fixture.
// No live network and no invented responses. --write explicitly refreshes the SAMPLE artifact.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { CORPUS_MANIFEST, LAB_CORPUS } from '../src/core/lab/corpus.ts';
import { summarizeFamilies } from '../src/core/lab/evaluate.ts';
import { registries } from '../src/core/registries/index.ts';
import { checkReference } from '../src/core/verify/verdict.ts';
import { installReplay } from '../tests/unit/replay.ts';
import { readRetractionWatchFrom } from '../src/core/registries/retractionWatch.ts';

if (process.env.RECORD === '1') throw new Error('This script only replays existing data.');
const hash = (v) => createHash('sha256').update(v).digest('hex');
const realNow = Date.now.bind(Date);
const realTimeout = globalThis.setTimeout;
const realFetch = globalThis.fetch;
const now = () => new Date(realNow()).toISOString();
const files = ['src/core/verify/verdict.ts', 'src/core/verify/compare.ts', 'src/core/verify/normalise.ts', 'src/core/registries/index.ts', 'src/core/registries/http.ts', 'src/core/registries/map.ts', 'src/core/registries/retractionWatch.ts', 'public/data/retraction-watch/meta.json', 'src/policy/policy.ts', 'src/core/lab/corpus.ts', 'src/core/lab/recorded-seeds.json', 'tests/unit/replay.ts', 'tests/unit/fixtures/registry.json'];
const startedAt = now();
const rows = [];
let simulated = realNow();
installReplay();
// The Retraction Watch index ships with the site; read the same files from disk, as the unit tests do.
readRetractionWatchFrom(async (path) => JSON.parse(readFileSync(`public/data/retraction-watch/${path}`, 'utf8')));
const replayFetch = globalThis.fetch;
const missing = new Set();
globalThis.fetch = async (...args) => {
  try { return await replayFetch(...args); }
  catch (e) { if (e instanceof Error && e.message.startsWith('not recorded: ')) missing.add(e.message.slice(14)); throw e; }
};
Date.now = () => simulated;
globalThis.setTimeout = (fn, ms, ...args) => { simulated += Math.max(0, Number(ms) || 0); return realTimeout(fn, 0, ...args); };
try {
  for (const c of LAB_CORPUS) {
    missing.clear();
    const at = now();
    try {
      const check = await checkReference(c.reference, registries, now);
      rows.push({ case: c, state: 'completed', startedAt: at, finishedAt: now(), check, missingReplay: [...missing] });
    } catch (e) {
      rows.push({ case: c, state: 'error', startedAt: at, finishedAt: now(), error: e instanceof Error ? e.message : String(e), missingReplay: [...missing] });
    }
  }
} finally { Date.now = realNow; globalThis.setTimeout = realTimeout; globalThis.fetch = realFetch; }
const run = { id: `recorded-replay-${startedAt}`, mode: 'sample', corpusVersion: CORPUS_MANIFEST.version, status: 'completed', startedAt, finishedAt: now(), rows };
const payload = { kind: 'recorded-replay', recordedAt: now(), registryCapturedAt: null, timing: 'simulated-retry-clock', corpusHash: hash(JSON.stringify(LAB_CORPUS)), sourceHashes: Object.fromEntries(files.map((f) => [f, hash(readFileSync(f))])), run };
const artifact = { sha256: hash(JSON.stringify(payload)), payload };
if (process.argv.includes('--write')) writeFileSync('src/core/lab/sample-run.json', `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ mode: 'SAMPLE: replay of existing registry recordings', written: process.argv.includes('--write'), cases: rows.length, missingReplayCases: rows.filter((r) => r.missingReplay.length).length, families: summarizeFamilies(rows), sha256: artifact.sha256 }, null, 2));
