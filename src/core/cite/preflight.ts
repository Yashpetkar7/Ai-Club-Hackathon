import { VERDICT_TEXT, type Policy, type Source } from '@/core/contracts';
import { cleanTitle } from '@/core/verify/normalise';
import { sourceIssues } from '@/policy/apply';
import { POLICY } from '@/policy/policy';
import { citable } from '@/store/actions';
import { sentenceCase } from './sentenceCase';
import { sourceToCsl } from './csl';

export interface Blocked { source: Source; why: string[] }
export interface Preflight {
  /** All three keys. */
  ready: Source[];
  /** Kept by the student with a written reason, which travels with every export. */
  withReason: Source[];
  blocked: Blocked[];
  /** Plain lines about what nobody checked. */
  notChecked: string[];
  /** Titles whose capitals the student should look at. */
  titles: { source: Source; words: string[] }[];
}

export const titleOf = (s: Source): string => (s.record ? cleanTitle(s.record.title) : (s.raw?.title ?? s.raw?.raw.slice(0, 120) ?? 'Untitled'));

function why(s: Source, policy: Policy): string[] {
  const out: string[] = [];
  if (!sourceToCsl(s, false)) out.push('There is no title to cite.');
  if (!s.keys.found && s.origin !== 'web') out.push('No registry has it, so it was never found.');
  if (s.check && s.check.verdict !== 'confirmed') out.push(`Checked as “${VERDICT_TEXT[s.check.verdict].label}”.`);
  else if (!s.check) out.push(s.origin === 'web' ? 'Web pages cannot be checked against a registry.' : 'It was never checked.');
  out.push(...sourceIssues(s, policy));
  if (!s.keys.approved) out.push('You have not approved it.');
  return out;
}

/** Decides what may leave. Anything without three keys stays behind unless the student kept it with a reason. */
export function preflight(sources: Source[], policy: Policy = POLICY): Preflight {
  const p: Preflight = { ready: [], withReason: [], blocked: [], notChecked: [], titles: [] };
  for (const s of sources) {
    const ok = citable(s, policy) && !!sourceToCsl(s, false);
    if (!ok) p.blocked.push({ source: s, why: why(s, policy) });
    else if (s.keys.found && s.keys.checked && !sourceIssues(s, policy).length) p.ready.push(s);
    else p.withReason.push(s);
    if (ok && !s.citeTitle) {
      const words = sentenceCase(titleOf(s)).check;
      if (words.length) p.titles.push({ source: s, words });
    }
  }
  const out = [...p.ready, ...p.withReason];
  const n = (k: number, one: string, many: string) => (k === 1 ? one : many.replace('#', String(k)));
  const web = out.filter((s) => s.origin === 'web').length;
  const noText = out.filter((s) => !s.text).length;
  const abs = out.filter((s) => s.textOrigin === 'abstract').length;
  p.notChecked.push('Whether any source is right. We check that it exists and matches, not that its findings are true.');
  if (web) p.notChecked.push(n(web, '1 web page was never compared with a registry.', '# web pages were never compared with a registry.'));
  if (noText) p.notChecked.push(n(noText, '1 source has no text we could read, so no claim was compared with its words.', '# sources have no text we could read, so no claim was compared with their words.'));
  if (abs) p.notChecked.push(n(abs, 'For 1 source only the abstract was read.', 'For # sources only the abstract was read.'));
  return p;
}

/** The only list an exporter accepts. */
export const exportSet = (sources: Source[], policy: Policy = POLICY): Source[] => {
  const p = preflight(sources, policy);
  return [...p.ready, ...p.withReason];
};

/** Every exporter calls this first, so a page that forgets pre-flight still cannot leak a bad source. */
export function mustBeExportable(sources: Source[], policy: Policy = POLICY): void {
  const bad = preflight(sources, policy).blocked[0];
  if (bad) throw new Error(`“${titleOf(bad.source)}” cannot be exported. ${bad.why[0] ?? ''}`.trim());
}

/** One line per source kept with a reason. Printed on every export. */
export const reasonNotes = (sources: Source[]): string[] =>
  sources.filter((s) => s.keptWithReason).map((s) => `${titleOf(s)}: ${s.check ? VERDICT_TEXT[s.check.verdict].label.toLowerCase() : 'not checked'}. Kept by the student. Reason: ${s.keptWithReason}`);
