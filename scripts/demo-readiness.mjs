// Run against the actual local server before rehearsing. Never substitutes fixtures.
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.DEMO_BASE_URL ?? 'http://127.0.0.1:4173';
const report = { mode: 'LIVE REQUESTS', startedAt: new Date().toISOString(), base, checks: [], ready: false };
async function check(name, run) {
  const start = performance.now();
  try {
    const detail = await run();
    report.checks.push({ name, status: 'passed', ms: Math.round(performance.now() - start), detail });
    console.log(`PASS ${name}: ${detail}`);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    report.checks.push({ name, status: 'blocked', ms: Math.round(performance.now() - start), detail });
    console.log(`BLOCKED ${name}: ${detail}`);
  }
}
async function get(path) {
  const r = await fetch(new URL(path, base), { signal: AbortSignal.timeout(25_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
}
const registry = (url) => `/api/registry?url=${encodeURIComponent(url)}`;
await check('Frontend served', async () => {
  const text = await (await get('/')).text();
  if (!text.includes('<html') || !text.includes('root')) throw new Error('The response is not the application HTML.');
  return 'Application HTML returned. This is not a browser journey test.';
});
await check('Server health', async () => {
  const data = await (await get('/api/health')).json();
  if (data.ok !== true) throw new Error('Health endpoint did not report ok.');
  return `Optional AI configured: ${!!data.ai}; OpenAlex key: ${!!data.openalexKey}; encrypted store available: ${!!data.saves}.`;
});
await check('Crossref known real reference', async () => {
  const j = await (await get(registry('https://api.crossref.org/works/10.1093/qje/qju032'))).json();
  if (j.message?.DOI?.toLowerCase() !== '10.1093/qje/qju032' || !j.message?.title?.length) throw new Error('Missing or mismatched registry identity.');
  return `${j.message.title[0]} · ${j.message.DOI}`;
});
await check('OpenAlex independent lookup', async () => {
  const j = await (await get(registry('https://api.openalex.org/works/https://doi.org/10.1093/qje/qju032'))).json();
  if (!j.doi?.toLowerCase().endsWith('10.1093/qje/qju032') || !j.title) throw new Error('Missing or mismatched second-registry identity.');
  return `${j.title} · ${j.id}. Retraction flag: ${j.is_retracted}.`;
});
await check('Search returns actual research records', async () => {
  const j = await (await get(registry('https://api.crossref.org/works?rows=3&query.bibliographic=working%20from%20home%20productivity'))).json();
  const items = j.message?.items;
  if (!Array.isArray(items) || !items.some((x) => x.DOI && x.title?.length)) throw new Error('No usable search records returned.');
  return `${items.length} records returned. This is availability, not relevance or truth evaluation.`;
});
report.finishedAt = new Date().toISOString();
report.ready = report.checks.every((x) => x.status === 'passed');
await mkdir('test-results', { recursive: true });
await writeFile('test-results/live-readiness.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(report.ready ? 'Network prerequisites passed. Rehearse the full browser journey and download an actual citation export.' : 'Live demo is not cleared. Resolve the blocked checks; use SAMPLE only when explicitly announced.');
process.exitCode = report.ready ? 0 : 1;
