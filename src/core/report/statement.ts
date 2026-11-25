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
    return Array.isArray(d.kept) && Array.isArray(d.changed) && Array.isArray(d.rejected) ? (d as Decided) : null;
  } catch {
    return null;
  }
};

export function statementLines(log: LogEvent[], project: Pick<Project, 'aiLevel'>): string[] {
  const calls = log.filter((e) => e.actor === 'ai' && e.action in TASK);
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
  }
  if (device.length) out.push(`A small language model ran on my own device ${times(device.length)} to compare a claim with a sentence from its source. It wrote no text, and no claim was sent anywhere.`);
  const checks = log.filter((e) => e.action === 'draft.checked').length;
  const fixes = log.filter((e) => e.action === 'draft.fix').length;
  if (checks) out.push(`A rule-based check, which is not AI, compared my draft with my own sources and looked for slips ${times(checks)}. ${fixes ? `I applied ${fixes === 1 ? 'one of its corrections' : `${fixes} of its corrections`}, each with a click.` : 'I applied none of its corrections.'}`);
  out.push('Paper Trail did not write any of my assignment. It has no feature that does.');
  out.push(`The AI permission level was ${project.aiLevel} (${AI_LEVELS[project.aiLevel]?.name ?? 'unknown'})${levels.length ? `, and was changed ${times(levels.length)}` : ''}. The level is my own declaration.`);
  const ok = log.filter((e) => e.action === 'source.approved').length;
  const reason = log.filter((e) => e.action === 'source.kept-with-reason').length;
  const n = (k: number) => `${k} ${k === 1 ? 'source' : 'sources'}`;
  if (ok || reason) out.push(`The log records that ${[ok ? `I approved ${n(ok)} after plain code had checked them in scholarly registries` : '', reason ? `I kept ${n(reason)} that did not pass, each with a written reason` : ''].filter(Boolean).join(', and that ')}.`);
  out.push('This statement covers only what happened inside Paper Trail. Any AI tool I used elsewhere is not recorded here and must be declared separately.');
  return out;
}
