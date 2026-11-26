import type { ReasonCode, ReferenceCheck, Verdict } from '@/core/contracts';

/**
 * The six statuses of Phase 2, derived only from the Checker's verdict. Nothing else may produce one:
 * not an AI, not a note, not the student. Precedence is the Checker's own (verdict.ts):
 * no answer > DOI belongs to another work > retracted > details differ > verified.
 */
export type Status = 'VERIFIED' | 'NEEDS FIX' | 'MISMATCH' | 'RETRACTED' | 'NOT FOUND' | 'NOT CHECKED';
export const STATUSES: Status[] = ['VERIFIED', 'NEEDS FIX', 'MISMATCH', 'RETRACTED', 'NOT FOUND', 'NOT CHECKED'];

const OF: Record<Verdict, Status> = {
  confirmed: 'VERIFIED',
  'details-differ': 'NEEDS FIX',
  'wrong-paper': 'MISMATCH',
  retracted: 'RETRACTED',
  'not-found': 'NOT FOUND',
  'could-not-check': 'NOT CHECKED',
  'one-registry': 'NOT CHECKED',
  'web-source': 'NOT CHECKED',
};

export const statusOf = (c: Pick<ReferenceCheck, 'verdict'> | undefined): Status => (c ? OF[c.verdict] : 'NOT CHECKED');

const FIELD_WORD: Partial<Record<ReasonCode, string>> = { YEAR_DIFFERS: 'YEAR', AUTHOR_DIFFERS: 'AUTHOR', TITLE_DIFFERS: 'TITLE', DOI_DOES_NOT_EXIST: 'DOI', AUTHORS_NOT_LISTED: 'AUTHORS NOT LISTED', JOURNAL_DIFFERS: 'JOURNAL', VOLUME_DIFFERS: 'VOLUME', ISSUE_DIFFERS: 'ISSUE', PAGES_DIFFERS: 'PAGES' };

/** The tag printed beside a reference in every export. Plain words, so it reads without the site. */
export function statusTag(c: Pick<ReferenceCheck, 'verdict' | 'reasons'> | undefined, o: { acknowledged?: boolean } = {}): string {
  if (!c) return '[NOT CHECKED – DATABASE VERIFICATION NOT COMPLETED]';
  switch (c.verdict) {
    case 'confirmed':
      return '[VERIFIED]';
    case 'details-differ': {
      const words = [...new Set(c.reasons.map((r) => FIELD_WORD[r]).filter(Boolean))];
      return `[NEEDS FIX – ${words.length ? `${words.join(', ')} DISCREPANCY` : 'DETAILS DIFFER'}]`;
    }
    case 'wrong-paper':
      return '[MISMATCH – DOI BELONGS TO ANOTHER PAPER]';
    case 'retracted':
      return o.acknowledged ? '[RETRACTED – RETRACTION ACKNOWLEDGED BY STUDENT]' : '[RETRACTED – DO NOT CITE WITHOUT ACKNOWLEDGING RETRACTION]';
    case 'not-found':
      return '[NOT FOUND – NO MATCHING SOURCE IDENTIFIED]';
    case 'web-source':
      return '[NOT CHECKED – WEB SOURCE, SCHOLARLY DATABASE VERIFICATION NOT APPLICABLE]';
    case 'one-registry':
      return '[NOT CHECKED – ONLY ONE DATABASE ANSWERED]';
    default:
      return '[NOT CHECKED – DATABASE VERIFICATION NOT COMPLETED]';
  }
}

/** What the student sees as the headline of a status. */
export const STATUS_PLAIN: Record<Status, string> = {
  VERIFIED: 'Two databases hold this exact work and no retraction is recorded.',
  'NEEDS FIX': 'The work is real but one or more details you wrote are wrong. You decide on each fix.',
  MISMATCH: 'The DOI is real but belongs to a different paper.',
  RETRACTED: 'The publisher has withdrawn this work.',
  'NOT FOUND': 'No database we searched holds a matching work. This is not a claim that it is fake.',
  'NOT CHECKED': 'Verification did not complete or does not apply. It is neither a pass nor a fail.',
};
