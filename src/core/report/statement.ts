import type { LogEvent, Project } from '@/core/contracts';
import { AI_LEVELS } from '@/policy/policy';

/**
 * The AI-use statement. Every sentence is built from log entries and nothing else.
 * No entry, no sentence. It reports only what happened inside Paper Trail.
 */
const TASK: Record<string, string> = { 'ai.plan': 'suggest search terms', 'ai.read': 'point at passages in sources already kept', 'ai.challenge': 'suggest a search for the opposite view' };
const day = (iso: string): string => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const times = (n: number): string => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

interface Decided { kept: string[]; changed: string[]; rejected: string[] }
const decided = (e: LogEvent): Decided | null => {
  try {
    const d = JSON.parse(e.detail) as Partial<Decided>;
    return d && [d.kept, d.changed, d.rejected].every((list) => Array.isArray(list) && list.every((x: unknown) => typeof x === 'string')) ? (d as Decided) : null;
  } catch {
    return null;
  }
};

export function statementLines(log: LogEvent[], project: Pick<Project, 'aiLevel'>): string[] {
  const ordered = [...log].sort((a, b) => a.seq - b.seq);
  const calls = ordered.filter((e) => e.actor === 'ai' && Object.hasOwn(TASK, e.action));
  const levels = log.filter((e) => e.action === 'ai.level');
  const device = log.filter((e) => e.action === 'support.model-ran');
  const out: string[] = [];
  if (!calls.length) out.push('No calls to a generative AI service are recorded in this project’s log.');
  else {
    const models = [...new Set(calls.map((e) => e.model ?? 'an unnamed model'))].join(', ');
    const first = day(calls[0]!.at);
    const last = day(calls[calls.length - 1]!.at);
    out.push(`I used generative AI (${models}) through Paper Trail ${first === last ? `on ${first}` : `between ${first} and ${last}`}.`);
    for (const [k, what] of Object.entries(TASK)) {
      const n = calls.filter((e) => e.action === k).length;
      if (n) out.push(`It was asked ${times(n)} to ${what}.`);
    }
    const unused = calls.filter((e) => e.detail.startsWith('answer rejected')).length;
    if (unused) out.push(`${unused === 1 ? 'One answer was' : `${unused} answers were`} thrown away by code because the shape was wrong.`);
    const ds = log.filter((e) => e.actor === 'student' && /^ai\.(plan|read|challenge)\.decided$/.test(e.action)).map(decided).filter((d): d is Decided => !!d);
    const sum = (k: keyof Decided) => ds.reduce((n, d) => n + d[k].length, 0);
    if (ds.length) out.push(`Of the suggestions I decided on, I kept ${sum('kept')}, changed ${sum('changed')} and rejected ${sum('rejected')}.`);
    else out.push('The log does not record which suggestions I kept, changed or rejected.');
    const prompts = calls.filter((e) => e.prompt?.trim());
    for (const e of prompts) out.push(`Recorded prompt on ${day(e.at)} (${e.model ?? 'model not recorded'}): ${e.prompt}`);
    if (prompts.length < calls.length) out.push(`Prompts are missing for ${calls.length - prompts.length} recorded AI calls. I need to review my own records before submission.`);
    out.push('The log cannot infer which sections of my submitted paper contain these ideas or how I incorporated them. I must describe that explicitly.');
  }
  if (device.length) out.push(`A small language model ran on my own device ${times(device.length)} to compare a claim with a sentence from its source. It wrote no text, and no claim was sent anywhere.`);
  const checks = log.filter((e) => e.action === 'draft.checked').length;
  const fixes = log.filter((e) => e.action === 'draft.fix').length;
  if (checks) out.push(`A rule-based check, which is not AI, compared my draft with my own sources and looked for slips ${times(checks)}. ${fixes ? `I applied ${fixes === 1 ? 'one of its corrections' : `${fixes} of its corrections`}, each with a click.` : 'I applied none of its corrections.'}`);
  out.push('Paper Trail did not write any of my assignment. It has no feature that does.');
  out.push(`The current AI permission level is ${project.aiLevel} (${AI_LEVELS[project.aiLevel]?.name ?? 'unknown'}). ${levels.length ? `${levels.length} level-change events are recorded. ` : ''}This does not establish the permission level at every earlier action. The level is my own declaration.`);
  const ok = log.filter((e) => e.action === 'source.approved').length;
  const reason = log.filter((e) => e.action === 'source.kept-with-reason').length;
  if (ok || reason) out.push(`The log records ${ok} source-approval events and ${reason} written-exception events. Repeated decisions may refer to the same source; these are event counts, not unique sources or current verification results.`);
  for (const e of ordered.filter((e) => e.actor === 'student' && e.action === 'ai.disclosure')) {
    try {
      const d = JSON.parse(e.detail) as { sections?: unknown; incorporation?: unknown };
      if (typeof d.sections === 'string' && typeof d.incorporation === 'string') out.push(`My additional disclosure (${day(e.at)}): Sections affected: ${d.sections}. How I used the ideas: ${d.incorporation}. This is my own account, not an independently checked event.`);
    } catch { /* Incomplete disclosure remains absent rather than guessed. */ }
  }
  out.push('This record does not establish that every source is scientifically correct, every claim was checked, or the history is complete.');
  out.push('This statement covers only what happened inside Paper Trail. Any AI tool I used elsewhere is not recorded here and must be declared separately.');
  return out;
}
