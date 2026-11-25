import { OVERCLAIM, RESULT_WORDS, sentences } from '@/core/challenge/challenge';
import { checkDraft, findCitations, sourceFor } from '@/core/cite/draft';
import { preflight, titleOf } from '@/core/cite/preflight';
import { judge } from '@/core/claims/label';
import { rankSentences } from '@/core/claims/rank';
import { CLAIM_TEXT, REASON_TEXT, VERDICT_TEXT, type Claim, type ClaimLabel, type LogEvent, type ReasonCode, type Source } from '@/core/contracts';
import { balance } from '@/core/report/balance';

/**
 * The Reviewer. Plain code that reads the whole project and lists what a marker could question.
 * It never approves anything. Passing every line here does not mean the work is right.
 */
export interface Finding { id: string; level: 'fix' | 'look' | 'ok'; title: string; detail: string; to: string; open: string }
export interface DraftLine { text: string; sources: string[]; label: ClaimLabel | 'uncited'; reasons: ReasonCode[]; passage?: string }
export interface Review { findings: Finding[]; lines: DraftLine[] }

const RANK: Record<ClaimLabel, number> = { verified: 4, reported: 3, 'not-found': 2, 'ai-reasoning': 1, disputed: 0 };

/** Each sentence of the draft, against the source it cites. */
export function auditDraft(draft: string, library: Source[]): DraftLine[] {
  const out: DraftLine[] = [];
  for (const s of sentences(draft)) {
    const cites = findCitations(s.text).filter((c) => c.year || c.noDate || sourceFor(c, library));
    let bare = s.text;
    for (const c of [...cites].reverse()) bare = bare.slice(0, c.start) + bare.slice(c.end);
    bare = bare.replace(/\(\s*[;,\s]*\)/g, '').replace(/\s+([.,;])/g, '$1').replace(/\s+/g, ' ').trim();
    const found = cites.map((c) => sourceFor(c, library)).filter((x): x is Source => !!x);
    if (!cites.length) {
      if (RESULT_WORDS.test(s.text) || /\d\s?%/.test(s.text)) out.push({ text: s.text, sources: [], label: 'uncited', reasons: ['NO_SOURCE'] });
      continue;
    }
    const judged = found.map((src) => {
      const p = src.text ? rankSentences(src.text, bare)[0] : undefined;
      return { src, p, j: judge(bare, src, p?.text) };
    });
    if (!judged.length) {
      out.push({ text: s.text, sources: [], label: 'not-found', reasons: ['NO_SOURCE'] });
      continue;
    }
    // One source that disagrees matters more than one that agrees.
    const worst = judged.find((x) => x.j.label === 'disputed');
    const best = [...judged].sort((a, b) => RANK[b.j.label] - RANK[a.j.label])[0]!;
    const pick = worst ?? best;
    out.push({ text: s.text, sources: judged.map((x) => titleOf(x.src)), label: pick.j.label, reasons: pick.j.reasons, ...(pick.p ? { passage: pick.p.text } : {}) });
  }
  return out;
}

const n = (k: number, one: string, many = `${one}s`): string => `${k} ${k === 1 ? one : many}`;

export function reviewProject(o: { projectId: string; sources: Source[]; claims: Claim[]; draft: string; log: LogEvent[] }): Review {
  const { sources, claims, draft, log } = o;
  const at = (step: string): string => `/p/${o.projectId}/${step}`;
  const f: Finding[] = [];
  const add = (level: Finding['level'], id: string, title: string, detail: string, step: string, open: string) => f.push({ id, level, title, detail, to: at(step), open });

  const p = preflight(sources);
  const ok = [...p.ready, ...p.withReason];
  const lines = draft.trim() ? auditDraft(draft, sources) : [];
  const d = checkDraft(draft, ok, sources);

  if (!sources.length) add('fix', 'none', 'There are no sources yet', 'Nothing can be reviewed without sources.', 'find', 'Find sources');
  if (d.unknown.length) add('fix', 'unknown', `${n(d.unknown.length, 'citation')} in your draft ${d.unknown.length === 1 ? 'is' : 'are'} not in your library`, d.unknown.join('; '), 'write', 'Open the draft');
  if (d.notCitable.length) add('fix', 'unapproved', `${n(d.notCitable.length, 'cited source')} you have not approved`, d.notCitable.map((x) => x.text).join('; '), 'library', 'Decide in the library');
  for (const l of lines.filter((x) => x.label === 'disputed')) add('fix', `d:${l.text.slice(0, 40)}`, 'A sentence says something its source does not', `“${l.text}” ${l.reasons.map((r) => REASON_TEXT[r]).join(' ')}`, 'write', 'Open the draft');
  for (const s of ok.filter((x) => x.check?.verdict === 'retracted')) add('fix', `r:${s.id}`, 'You kept a retracted source', `${titleOf(s)}. Your reason: ${s.keptWithReason ?? 'none'}`, 'library', 'Open the library');

  const uncited = lines.filter((l) => l.label === 'uncited');
  if (uncited.length) add('look', 'uncited', `${n(uncited.length, 'sentence')} with a result or a figure and no citation`, uncited.map((l) => `“${l.text}”`).join(' '), 'write', 'Open the draft');
  const reported = lines.filter((l) => l.label === 'reported');
  if (reported.length) add('look', 'reported', `${n(reported.length, 'cited sentence')} we could not confirm`, 'The source is real. We could not match your words to a sentence in the text we can read.', 'evidence', 'Check in Evidence');
  const strong = sentences(draft).filter((s) => OVERCLAIM.test(s.text));
  if (strong.length) add('look', 'strong', `${n(strong.length, 'sentence')} with a very strong word`, strong.map((s) => `“${s.text.match(OVERCLAIM)![0]}” in “${s.text.slice(0, 80)}”`).join('; '), 'write', 'Open the draft');
  if (p.blocked.length) add('look', 'blocked', `${n(p.blocked.length, 'source')} will stay behind on export`, p.blocked.map((b) => `${titleOf(b.source)}: ${b.why[0] ?? ''}`).join(' '), 'library', 'Decide in the library');
  const weak = ok.filter((s) => s.check && s.check.verdict !== 'confirmed' && s.check.verdict !== 'retracted');
  if (weak.length) add('look', 'weak', `${n(weak.length, 'source')} kept although not confirmed`, weak.map((s) => `${titleOf(s)}: ${VERDICT_TEXT[s.check!.verdict].label.toLowerCase()}`).join('; '), 'library', 'Open the library');
  const kept = claims.filter((c) => c.decision !== 'rejected' && c.label !== 'verified');
  if (kept.length) add('look', 'claims', `${n(kept.length, 'claim')} kept without being Verified`, kept.map((c) => `“${c.text}” ${CLAIM_TEXT[c.label].label.toLowerCase()}`).join('; '), 'evidence', 'Open Evidence');
  if (draft.trim() && d.neverCited.length) add('look', 'never', `${n(d.neverCited.length, 'approved source')} never cited`, d.neverCited.map(titleOf).join('; '), 'write', 'Open the draft');
  if (p.titles.length) add('look', 'titles', `${n(p.titles.length, 'title')} with capitals only you can judge`, p.titles.map((t) => `${titleOf(t.source)} (${t.words.join(', ')})`).join('; '), 'library', 'Open the library');
  const noText = ok.filter((s) => !s.text);
  if (noText.length) add('look', 'text', `${n(noText.length, 'source')} with no text to compare`, noText.map(titleOf).join('; '), 'library', 'Add a PDF');
  for (const note of balance(ok).notes) add('look', `b:${note}`, 'Your sources lean one way', note, 'map', 'See the map');
  if (ok.length === 1) add('look', 'one', 'Everything rests on one source', 'One study is thin evidence.', 'find', 'Find more');
  if (sources.length && !log.some((e) => e.action === 'challenger.searched')) add('look', 'sides', 'You have not looked for the other side', 'The Challenger searches for evidence against a claim as hard as for it.', 'challenge', 'Challenge a claim');

  if (p.ready.length) add('ok', 'ready', `${n(p.ready.length, 'source')} found, checked and approved`, p.ready.map(titleOf).join('; '), 'export', 'Open export');
  const good = lines.filter((l) => l.label === 'verified');
  if (good.length) add('ok', 'lines', `${n(good.length, 'cited sentence')} match the source word for word`, 'That means the source says it, not that the source is right.', 'write', 'Open the draft');
  const verified = claims.filter((c) => c.decision !== 'rejected' && c.label === 'verified');
  if (verified.length) add('ok', 'verified', `${n(verified.length, 'claim')} Verified`, verified.map((c) => `“${c.text}”`).join(' '), 'evidence', 'Open Evidence');
  if (log.some((e) => e.action === 'challenger.searched')) add('ok', 'challenged', 'You looked for evidence against yourself', 'The search is in the log.', 'challenge', 'Open Challenge');
  return { findings: f, lines };
}
