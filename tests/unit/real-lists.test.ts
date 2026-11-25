// @vitest-environment node
import { expect, it } from 'vitest';
import { registries } from '@/core/registries';
import { extractReferences } from '@/core/verify/parse';
import { checkReference } from '@/core/verify/verdict';

/** Measures false alarms on reference lists of published papers. Run with:  LIVE=1 npx vitest run tests/unit/real-lists.test.ts */
it.runIf(process.env.LIVE === '1')('real reference lists from published papers', async () => {
  const lists = ['10.1038/s41599-023-02269-7', '10.3390/su15075614', '10.1186/s41239-023-00411-8', '10.1371/journal.pone.0298522', '10.1038/s41598-023-45644-9'];
  const lines: { text: string; doi?: string }[] = [];
  for (const d of lists) {
    const r = await fetch(`https://api.crossref.org/works/${d}`);
    if (!r.ok) continue;
    const refs = ((await r.json()) as any).message.reference ?? [];
    for (const x of refs) if (x.unstructured && x.unstructured.length > 60 && /\d{4}/.test(x.unstructured)) lines.push({ text: x.unstructured.replace(/\s+/g, ' '), ...(x.DOI ? { doi: x.DOI } : {}) });
  }
  const pick = lines.filter((_, i) => i % Math.max(1, Math.floor(lines.length / 60)) === 0).slice(0, 60);
  const tally: Record<string, number> = {};
  const odd: string[] = [];
  for (const l of pick) {
    const found = extractReferences(l.text).references[0];
    if (!found) {
      tally.unparsed = (tally.unparsed ?? 0) + 1;
      continue;
    }
    const c = await checkReference(found, registries);
    tally[c.verdict] = (tally[c.verdict] ?? 0) + 1;
    if (c.verdict !== 'confirmed') odd.push(`${c.verdict} [${c.reasons.join(',')}] T="${found.title ?? ''}" A=${(found.authors ?? []).slice(0, 3).join('/')} R="${c.record?.title ?? ''}" :: ${l.text.slice(0, 170)}`);
  }
  console.log(pick.length, JSON.stringify(tally));
  console.log(odd.join('\n'));
  expect(pick.length).toBeGreaterThan(5);
}, 400_000);
