import { CLAIM_TEXT, REASON_TEXT, VERDICT_TEXT, type Claim, type LogEvent, type Project, type Source } from '@/core/contracts';
import { pageText } from '@/core/pdf/pages';
import { cleanTitle } from '@/core/verify/normalise';
import { verifyChain } from '@/log/log';
import { citable } from '@/store/actions';
import { db } from '@/store/db';
import { AI_LEVELS } from '@/policy/policy';

export interface ReportData { project: Project; sources: Source[]; claims: Claim[]; log: LogEvent[]; generatedAt: string }

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** One self-contained page for faculty. No scripts, no outside files, every value escaped. */
export async function buildReport(d: ReportData): Promise<string> {
  const chain = await verifyChain(d.log);
  const cell = (s: unknown) => `<td>${esc(s)}</td>`;
  const sources = d.sources.map((s) => {
    const r = s.record;
    const v = s.check ? VERDICT_TEXT[s.check.verdict].label : 'Not checked';
    const why = s.check?.reasons.map((x) => REASON_TEXT[x]).join(' ') ?? '';
    const doi = r?.doi && /^10\.\d{4,9}\/[^\s"'<>]+$/.test(r.doi) ? `<a href="https://doi.org/${esc(encodeURI(r.doi))}" rel="noreferrer">${esc(r.doi)}</a>` : '';
    return `<tr><td>${esc(r ? cleanTitle(r.title) : (s.raw?.title ?? s.raw?.raw ?? 'Untitled'))}<br><small>${esc([r?.authors.map((a) => a.family).join(', '), r?.year, r?.container].filter(Boolean).join(' · '))} ${doi}</small></td><td><b>${esc(v)}</b><br><small>${esc(why)}</small></td><td>${esc([s.keys.found && 'found', s.keys.checked && 'checked', s.keys.approved && 'approved'].filter(Boolean).join(', ') || 'none')}</td><td>${citable(s) ? 'yes' : 'no'}${s.keptWithReason ? `<br><small>Kept by the student: ${esc(s.keptWithReason)}</small>` : ''}</td></tr>`;
  }).join('');
  const byId = new Map(d.sources.map((s) => [s.id, s]));
  const claims = d.claims.map((c) => `<tr>${cell(c.text)}<td><b>${esc(CLAIM_TEXT[c.label].label)}</b><br><small>${esc(c.reasons.map((x) => REASON_TEXT[x]).join(' '))}</small></td><td>${c.passage ? `&ldquo;${esc(c.passage.text)}&rdquo;<br><small>${esc([byId.get(c.passage.sourceId)?.record?.title, c.passage.page ? pageText({ ...c.passage, page: c.passage.page }) : ''].filter(Boolean).join(' · '))}</small>` : 'No passage'}</td><td>${esc(c.decision ?? 'not decided')}${c.keptWithReason ? `<br><small>${esc(c.keptWithReason)}</small>` : ''}</td></tr>`).join('');
  const un = d.sources.filter((s) => !s.check || s.check.verdict === 'could-not-check').length;
  const noText = d.sources.filter((s) => !s.text).length;
  const ai = d.log.filter((e) => e.actor === 'ai');
  const not = [
    'Whether any source is correct. Verified means the source says it.',
    'Text copied from anywhere outside the student\u2019s library, and whether the writing is the student\u2019s own.',
    un ? `${un} source(s) could not be checked or were never checked.` : '',
    noText ? `${noText} source(s) had no text we could read, so claims about them were not compared with their words.` : '',
    d.sources.some((s) => s.textOrigin === 'abstract') ? 'Where only an abstract was available, only the abstract was read.' : '',
  ].filter(Boolean);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Evidence report</title><style>body{font:16px/1.55 system-ui,sans-serif;color:#102c2b;background:#fbfdfc;max-width:1000px;margin:32px auto;padding:0 20px}h1,h2{font-family:Georgia,serif;font-weight:400}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;vertical-align:top;padding:8px 10px 8px 0;border-top:1px solid #c0d2cc;overflow-wrap:anywhere}small{color:#45605c}.w{overflow-x:auto}</style></head><body>
<h1>Evidence report</h1><p><b>${esc(d.project.question)}</b></p><p>Made ${esc(d.generatedAt)} by Paper Trail from the student&rsquo;s own browser. AI permission level ${d.project.aiLevel}: ${esc(AI_LEVELS[d.project.aiLevel]?.name)}.</p>
<h2>Sources (${d.sources.length})</h2><div class="w"><table><tr><th>Source</th><th>Verdict</th><th>Keys</th><th>May be cited</th></tr>${sources || '<tr><td colspan="4">None</td></tr>'}</table></div>
<h2>Claims (${d.claims.length})</h2><div class="w"><table><tr><th>Claim</th><th>Label</th><th>Exact words in the source</th><th>Student&rsquo;s decision</th></tr>${claims || '<tr><td colspan="4">None</td></tr>'}</table></div>
<h2>AI use</h2><p>${ai.length ? `${ai.length} AI call(s), using ${esc([...new Set(ai.map((e) => e.model ?? 'an unnamed model'))].join(', '))}.` : 'No AI calls are recorded in this log.'}</p>
<h2>What was not checked</h2><ul>${not.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
<h2>Log</h2><p>${chain.ok ? `${chain.count} entries. Each one matches the entry before it.` : `This log was changed or is incomplete at entry ${chain.brokenAt} of ${chain.count}.`} The log shows edits. It cannot stop someone rebuilding the whole of it.</p><div class="w"><table><tr><th>When</th><th>Who</th><th>What</th><th>Detail</th></tr>${d.log.map((e) => `<tr>${cell(e.at)}${cell(e.actor)}${cell(e.action)}${cell(e.detail)}</tr>`).join('')}</table></div></body></html>`;
}

export async function projectReport(project: Project): Promise<string> {
  const [sources, claims, log] = await Promise.all([db.sources.where('projectId').equals(project.id).toArray(), db.claims.where('projectId').equals(project.id).toArray(), db.log.where('projectId').equals(project.id).sortBy('seq')]);
  return buildReport({ project, sources, claims, log, generatedAt: new Date().toISOString() });
}

export function download(name: string, html: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
