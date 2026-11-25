import { CLAIM_TEXT, type Claim, type Passage, type Source } from '@/core/contracts';
import { record as log } from '@/log/log';
import { pageAt } from '@/core/pdf/pages';
import { POLICY } from '@/policy/policy';
import { db, newId } from '@/store/db';
import { judge, type Support } from './label';

/** Gate 3. The label is judged again here, so a page can never save one it made up. */
export async function saveClaim(o: {
  projectId: string;
  text: string;
  source?: Source;
  passage?: { text: string; start: number; end: number };
  support?: Support | null;
  decision: 'accepted' | 'rewritten' | 'rejected';
  reason?: string;
  by?: Claim['by'];
}): Promise<Claim> {
  const text = o.text.trim();
  if (text.split(/\s+/).length < 3) throw new Error('Write the claim as a full sentence first.');
  const j = judge(text, o.source, o.passage?.text, o.support ?? null);
  const reason = (o.reason ?? '').trim();
  if (o.decision !== 'rejected' && j.label !== 'verified' && reason.length < POLICY.overrideReasonMinChars) throw new Error(`This is not Verified. Write at least ${POLICY.overrideReasonMinChars} characters on why you are keeping it.`);
  const page = o.source && o.passage ? pageAt(o.source, o.passage.start, o.passage.end) : null;
  const passage: Passage | undefined = o.source && o.passage ? { id: `${o.source.id}:${o.passage.start}`, sourceId: o.source.id, ...o.passage, ...(page ?? {}) } : undefined;
  const claim: Claim = {
    id: newId(),
    projectId: o.projectId,
    text,
    label: j.label,
    reasons: j.reasons,
    checks: j.checks,
    decision: o.decision,
    by: o.by ?? 'student',
    createdAt: new Date().toISOString(),
    ...(o.source ? { sourceId: o.source.id } : {}),
    ...(passage ? { passage } : {}),
    ...(j.label !== 'verified' && o.decision !== 'rejected' ? { keptWithReason: reason } : {}),
  };
  await db.claims.add(claim);
  await log(o.projectId, 'student', `gate3.claim-${o.decision}`, `${text.slice(0, 200)} [${CLAIM_TEXT[j.label].label}]${claim.keptWithReason ? ` | reason: ${claim.keptWithReason}` : ''}`);
  return claim;
}

export async function removeClaim(id: string): Promise<void> {
  const c = await db.claims.get(id);
  if (!c) return;
  await db.claims.delete(id);
  await log(c.projectId, 'student', 'claim.removed', c.text.slice(0, 200));
}
