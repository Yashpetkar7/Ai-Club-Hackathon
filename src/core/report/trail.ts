import { CLAIM_TEXT, type Claim, type ClaimLabel, type Source } from '@/core/contracts';
import { titleOf } from '@/core/cite/preflight';
import { pageText } from '@/core/pdf/pages';

/** One claim the student decided to use, with the exact words of its source. The same rows go on the page and into the Word file. */
export interface TrailRow {
  id: string;
  claim: string;
  label: ClaimLabel;
  labelText: string;
  /** The source's own words, exactly as stored. Missing when no passage was found. */
  quote?: string;
  source?: string;
  where?: string;
  decision: 'accepted' | 'rewritten';
  reason?: string;
}

/** Only claims the student accepted or rewrote: those are the ones in their writing. Oldest first. */
export function claimTrail(claims: Claim[], sources: Source[]): TrailRow[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  return claims
    .filter((c): c is Claim & { decision: 'accepted' | 'rewritten' } => c.decision === 'accepted' || c.decision === 'rewritten')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((c) => {
      const src = byId.get(c.passage?.sourceId ?? c.sourceId ?? '');
      const where = c.passage?.page ? pageText({ ...c.passage, page: c.passage.page }) : c.passage && src?.textOrigin === 'abstract' ? 'Abstract' : undefined;
      return {
        id: c.id,
        claim: c.text,
        label: c.label,
        labelText: CLAIM_TEXT[c.label].label,
        ...(c.passage?.text ? { quote: c.passage.text } : {}),
        ...(src ? { source: titleOf(src) } : {}),
        ...(where ? { where } : {}),
        decision: c.decision,
        ...(c.keptWithReason ? { reason: c.keptWithReason } : {}),
      };
    });
}

/** The row as plain sentences, for the Word file and anything else without styling. */
export function trailLines(r: TrailRow): string[] {
  return [
    `Claim: ${r.claim} (${r.labelText}${r.decision === 'rewritten' ? ', rewritten by me' : ''})`,
    r.quote ? `The source says: “${r.quote}”${[r.source, r.where].filter(Boolean).length ? ` (${[r.source, r.where].filter(Boolean).join(', ')})` : ''}` : 'No sentence in a source was found for this claim.',
    ...(r.reason ? [`My reason for keeping it: ${r.reason}`] : []),
  ];
}
