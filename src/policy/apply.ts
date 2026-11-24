import type { Policy, RegistryRecord, Source } from '@/core/contracts';
import { POLICY } from './policy';

/** House rules applied to one work. An empty list means it is inside the rules. Plain code, shown to the student. */
export function policyIssues(rec: RegistryRecord | undefined, policy: Policy = POLICY): string[] {
  if (!rec) return [];
  const out: string[] = [];
  if (policy.minYear && (rec.year ?? 0) < policy.minYear) out.push(rec.year ? `Published in ${rec.year}. House rules ask for ${policy.minYear} or later.` : `No year given. House rules ask for ${policy.minYear} or later.`);
  const type = TYPE_ALIAS[rec.type ?? ''] ?? rec.type;
  if (type && !policy.allowedTypes.includes(type)) out.push(`This is listed as "${type}", which house rules do not allow.`);
  if (policy.peerReviewedOnly && !PEER_REVIEWED.has(type ?? '')) out.push('House rules ask for journal or conference papers. This is not listed as one.');
  return out;
}

/** OpenAlex and DataCite use shorter names than Crossref. */
const TYPE_ALIAS: Record<string, string> = { article: 'journal-article', preprint: 'posted-content', review: 'journal-article', text: 'posted-content', journalarticle: 'journal-article', conferencepaper: 'proceedings-article' };
const PEER_REVIEWED = new Set(['journal-article', 'proceedings-article']);

export const sourceIssues = (s: Source, policy: Policy = POLICY): string[] => policyIssues(s.record, policy);

/** One plain line per rule, for the House rules page. */
export function policyLines(p: Policy = POLICY): string[] {
  return [
    p.minYear ? `Sources must be from ${p.minYear} or later.` : 'Sources may be from any year.',
    p.peerReviewedOnly ? 'Only journal and conference papers.' : 'Journal papers, conference papers, books, reports, preprints and web pages.',
    p.blockRetracted ? 'Retracted work is blocked unless you keep it with a written reason.' : 'Retracted work is flagged.',
    `At most ${p.maxAiCallsPerProject} AI calls per project.`,
    `Keeping anything outside these rules needs a reason of at least ${p.overrideReasonMinChars} characters.`,
  ];
}
