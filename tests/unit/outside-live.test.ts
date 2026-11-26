// @vitest-environment node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { registries } from '@/core/registries';
import { extractReferences } from '@/core/verify/parse';
import { checkReference } from '@/core/verify/verdict';

/**
 * Live check of references that are in none of our fixtures: a random Crossref sample, papers Retraction Watch
 * lists as retracted, and real references our code altered on purpose. Needs the network, so it only runs with
 *   LIVE=1 npx vitest run tests/unit/outside-live.test.ts
 * Picks come from ml/work/outside_refs.json (built from ml/collect_risk_data.py output); results go to ml/results/outside-check.json.
 */
const SRC = 'ml/work/outside_refs.json';
type Ref = { doi: string; title: string; authors: string[]; year: number; journal: string; kind: string; expect: string };

it.runIf(process.env.LIVE === '1' && existsSync(SRC))('outside references, checked live', async () => {
  const refs: Ref[] = JSON.parse(readFileSync(SRC, 'utf8'));
  const rows: { kind: string; doi: string; expect: string; got: string; reasons: string[]; asked: string[] }[] = [];
  for (const r of refs) {
    const names = r.authors.map((a) => `${a}, A.`).join(', ');
    const line = `${names} (${r.year}). ${r.title}. ${r.journal}. https://doi.org/${r.doi}`;
    const parsed = extractReferences(line).references[0];
    const c = parsed ? await checkReference(parsed, registries) : null;
    rows.push({ kind: r.kind, doi: r.doi, expect: r.expect, got: c?.verdict ?? 'not parsed', reasons: c?.reasons ?? [], asked: c?.trace.map((t) => `${t.registry}:${t.status}`) ?? [] });
  }
  const tally = (k: string) => rows.filter((x) => x.kind.startsWith(k));
  const summary = {
    checkedAt: new Date().toISOString(),
    real: { n: tally('real').length, confirmed: tally('real').filter((x) => x.got === 'confirmed').length, other: tally('real').filter((x) => x.got !== 'confirmed').map((x) => `${x.doi}: ${x.got} ${x.reasons.join(',')}`) },
    retracted: { n: tally('retracted').length, flagged: tally('retracted').filter((x) => x.got === 'retracted').length, other: tally('retracted').filter((x) => x.got !== 'retracted').map((x) => `${x.doi}: ${x.got}`) },
    altered: { n: tally('altered').length, caught: tally('altered').filter((x) => x.got !== 'confirmed' && x.got !== 'one-registry').length, confirmedByMistake: tally('altered').filter((x) => x.got === 'confirmed').map((x) => x.doi) },
  };
  writeFileSync('ml/results/outside-check.json', `${JSON.stringify({ summary, rows }, null, 1)}\n`);
  console.info(JSON.stringify(summary, null, 1));
  // The one thing that must never happen: an altered reference shown as Confirmed.
  expect(summary.altered.confirmedByMistake).toEqual([]);
}, 300_000);
