import { exportable, type Policy, type RegistryRecord, type Source } from '@/core/contracts';
import { POLICY } from './policy';

/** House rules applied to one work. An empty list means it is inside the rules. Plain code, shown to the student. */
export function policyIssues(rec: RegistryRecord | undefined, policy: Policy = POLICY): string[] {
  if (!rec) return [];
  const out: string[] = [];
  if (policy.minYear && (rec.year ?? 0) < policy.minYear) out.push(rec.year ? `Published in ${rec.year}. House rules ask for ${policy.minYear} or later.` : `No year given. House rules ask for ${policy.minYear} or later.`);
  const type = TYPE_ALIAS[rec.type ?? ''] ?? rec.type;
  if (type && !policy.allowedTypes.includes(type)) out.push(`This is listed as "${type}", which house rules do not allow.`);
  const concern = policy.flagConcerns ? rec.notices?.find((x) => x.kind === 'concern') : undefined;
  if (concern) out.push(`The journal has published an expression of concern about this work${concern.on ? ` (${concern.on})` : ''}.`);
  if (policy.peerReviewedOnly && !PEER_REVIEWED.has(type ?? '')) out.push('House rules ask for journal or conference papers. This is not listed as one.');
  return out;
}

/** OpenAlex and DataCite use shorter names than Crossref. */
const TYPE_ALIAS: Record<string, string> = { article: 'journal-article', preprint: 'posted-content', review: 'journal-article', text: 'posted-content', journalarticle: 'journal-article', conferencepaper: 'proceedings-article' };
const PEER_REVIEWED = new Set(['journal-article', 'proceedings-article']);

export const sourceIssues = (s: Source, policy: Policy = POLICY): string[] => [
  ...(s.check?.sample ? ['This is a SAMPLE check. Run a live check before approving or citing this source.'] : []),
  ...policyIssues(s.record, policy),
];

/** Sample receipts cannot become live evidence, even through a written exception. */
export const canCiteSource = (s: Source, policy: Policy = POLICY): boolean => !s.check?.sample && (
  (exportable(s) && !sourceIssues(s, policy).length) ||
  (s.keys.approved && !!s.keptWithReason && (!!s.record || s.origin === 'web' || s.origin === 'manual'))
);

/** One plain line per rule, for the House rules page. */
export function policyLines(p: Policy = POLICY): string[] {
  return [
    p.minYear ? `Sources must be from ${p.minYear} or later.` : 'Sources may be from any year.',
    p.peerReviewedOnly ? 'Only journal and conference papers.' : 'Journal papers, conference papers, books, reports, preprints and web pages.',
    p.blockRetracted ? 'Retracted work is blocked unless you keep it with a written reason.' : 'Retracted work is flagged.',
    p.flagConcerns ? 'A work under an expression of concern needs a written reason too. Corrections are shown.' : 'Expressions of concern and corrections are shown.',
    p.draftCheck.copied ? 'Your draft can be compared with the sources in your own library, to find words that need quotation marks or a citation.' : 'The copied-text check is off.',
    p.draftCheck.language ? 'A rule-based writing check may correct slips when you click. It is not AI and never rewrites a sentence.' : 'The writing check is off.',
    `At most ${p.maxAiCallsPerProject} AI calls per project.`,
    'The AI level is your own declaration. The server refuses AI above it, and every change is logged. It prevents accidents. It does not police cheating.',
    `Keeping anything outside these rules needs a reason of at least ${p.overrideReasonMinChars} characters.`,
  ];
}
