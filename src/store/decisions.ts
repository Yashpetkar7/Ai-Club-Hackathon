import { currentSession } from '@/auth/accounts';
import type { FieldDiff, FixDecision, RawReference, ReferenceCheck, Source } from '@/core/contracts';
import { checkAgain, type Ask } from '@/core/library/watch';
import { findInstructions } from '@/core/pdf/injection';
import { statusOf } from '@/core/verify/status';
import { record as log } from '@/log/log';
import { POLICY } from '@/policy/policy';
import { approveSource } from './actions';
import { db } from './db';

/**
 * Phase 2 student decisions. Every one is the student's click, every one writes an audit event with the reference,
 * the state before and after, the evidence and who decided. Nothing here is reachable from an AI task or from text
 * inside a note, quote or source: these functions are called only by buttons.
 */
export interface AuditEntry { ref: string; title: string; action: string; before: string; after: string; evidence: string; by: string; at: string }

const who = (): string => {
  const s = currentSession();
  return s.kind === 'account' ? `account:${s.id}` : 'guest';
};
const titleFor = (s: Source): string => s.record?.title ?? s.raw?.title ?? s.raw?.raw.slice(0, 120) ?? s.id;

async function audit(s: Source, action: string, before: string, after: string, evidence: string): Promise<AuditEntry> {
  const e: AuditEntry = { ref: s.id, title: titleFor(s).slice(0, 160), action, before, after, evidence: evidence.slice(0, 600), by: who(), at: new Date().toISOString() };
  await log(s.projectId, 'student', `decision.${action}`, JSON.stringify(e));
  return e;
}

/** The decisions for one reference, newest first, read back from the hash-chained log. */
export async function decisionsFor(s: Source): Promise<AuditEntry[]> {
  const ev = await db.log.where('projectId').equals(s.projectId).filter((e) => e.action.startsWith('decision.')).toArray();
  return ev
    .map((e) => {
      try {
        return JSON.parse(e.detail) as AuditEntry;
      } catch {
        return null;
      }
    })
    .filter((x): x is AuditEntry => !!x && x.ref === s.id)
    .reverse();
}

/** The registry value a fix would put in, as the field holds it. */
export function suggested(field: FieldDiff['field'], check: ReferenceCheck): Partial<RawReference> | null {
  const r = check.record;
  if (!r) return null;
  if (field === 'title') return { title: r.title };
  if (field === 'authors') return r.authors.length ? { authors: r.authors.map((a) => a.family) } : null;
  if (field === 'year') return r.year ? { year: r.year } : null;
  if (field === 'doi') return r.doi ? { doi: r.doi } : null;
  if (field === 'container') return r.container ? { container: r.container } : null;
  if (field === 'volume') return r.volume ? { volume: r.volume } : null;
  if (field === 'issue') return r.issue ? { issue: r.issue } : null;
  if (field === 'pages') return r.pages ? { pages: r.pages } : null;
  return null;
}

const evidenceOf = (check: ReferenceCheck): string => {
  const has = check.trace.filter((t) => t.status === 'match').map((t) => t.registry);
  return `${[...new Set(has)].join(' + ') || 'registry'} record ${check.record?.doi ?? check.record?.id ?? ''}, checked ${check.checkedAt}`;
};

/**
 * Accept one suggested fix: the reference takes the registry value, the first submission is kept in `original`,
 * the decision is logged, and the reference is checked again from scratch. The new status is whatever that check says.
 */
export async function acceptFix(sourceId: string, field: FieldDiff['field'], ask?: Ask): Promise<{ status: string; rechecked: boolean }> {
  const s = await db.sources.get(sourceId);
  if (!s?.check || !s.raw) throw new Error('There is nothing to fix on this source.');
  const diff = s.check.fields.find((f) => f.field === field && !f.ok);
  const value = suggested(field, s.check);
  if (!diff || !value) throw new Error('This field has no suggested fix.');
  const before = statusOf(s.check);
  const raw: RawReference = { ...s.raw, ...value };
  const fix: FixDecision = { field, decision: 'accepted', from: diff.given, to: diff.registry, evidence: evidenceOf(s.check), at: new Date().toISOString() };
  // One update, so the original, the fix and the new value land together or not at all.
  await db.sources.update(sourceId, { raw, original: s.original ?? s.raw, fixes: [...(s.fixes ?? []), fix] });
  const next = (await db.sources.get(sourceId))!;
  const r = await checkAgain(next, ...(ask ? [ask] : []));
  const after = r.ok ? statusOf(r.check) : `${before} (check again: a registry did not answer)`;
  await audit(next, 'fix-accepted', `${before}; ${field} = ${diff.given}`, `${after}; ${field} = ${diff.registry}`, fix.evidence);
  return { status: after, rechecked: r.ok };
}

/** Reject one suggested fix: the student's value stays, the reference stays flagged, the decision is logged. */
export async function rejectFix(sourceId: string, field: FieldDiff['field']): Promise<void> {
  const s = await db.sources.get(sourceId);
  if (!s?.check) throw new Error('There is nothing to decide on this source.');
  const diff = s.check.fields.find((f) => f.field === field && !f.ok);
  if (!diff) throw new Error('This field has no suggested fix.');
  const fix: FixDecision = { field, decision: 'rejected', from: diff.given, to: diff.registry, evidence: evidenceOf(s.check), at: new Date().toISOString() };
  await db.sources.update(sourceId, { fixes: [...(s.fixes ?? []), fix] });
  const st = statusOf(s.check);
  await audit(s, 'fix-rejected', `${st}; ${field} = ${diff.given}`, `${st} (unchanged, still flagged); ${field} = ${diff.given}`, fix.evidence);
}

/** A retracted work may be used only after the student says so in writing. The status stays RETRACTED everywhere. */
export async function acknowledgeRetraction(sourceId: string, text: string): Promise<void> {
  const s = await db.sources.get(sourceId);
  if (!s?.check || s.check.verdict !== 'retracted') throw new Error('This source is not retracted.');
  const t = text.trim();
  if (t.length < POLICY.overrideReasonMinChars) throw new Error(`Write at least ${POLICY.overrideReasonMinChars} characters on why you are using a retracted work.`);
  const n = s.record?.notices?.find((x) => x.kind === 'retraction');
  await db.sources.update(sourceId, { retractionAcknowledged: { at: new Date().toISOString(), text: t } });
  if (!s.keys.approved) await approveSource(sourceId, `Retraction acknowledged: ${t}`);
  await audit(s, 'retraction-acknowledged', 'RETRACTED; not acknowledged', 'RETRACTED; acknowledged, kept with reason', `${n?.label ?? 'Retracted'}${n?.on ? ` ${n.on}` : ''}${n?.doi ? ` notice ${n.doi}` : ''}; student wrote: ${t}`);
}

/** The student asked to check again. Logged with the status before and after. */
export async function recheckDecision(sourceId: string, ask?: Ask): Promise<{ ok: boolean; status: string }> {
  const s = await db.sources.get(sourceId);
  if (!s) throw new Error('This source no longer exists.');
  const before = statusOf(s.check);
  const r = await checkAgain(s, ...(ask ? [ask] : []));
  const after = r.ok ? statusOf(r.check) : `${before} (kept: a registry did not answer)`;
  await audit(s, 'rechecked', before, after, r.check.trace.map((t) => `${t.registry} ${t.status}`).join(', '));
  return { ok: r.ok, status: after };
}

/**
 * A note is the student's own text, stored as plain data in `notes`. It is never sent to a model as an instruction,
 * never parsed for commands, and cannot reach a status, a rule or another source. If it reads like an instruction
 * to an AI we say so and save it anyway, unchanged.
 */
export async function saveNote(sourceId: string, note: string): Promise<{ flagged: string[]; statusBefore: string; statusAfter: string }> {
  const s = await db.sources.get(sourceId);
  if (!s) throw new Error('This source no longer exists.');
  const flagged = findInstructions(note);
  const statusBefore = statusOf(s.check);
  await db.sources.update(sourceId, { notes: note });
  const after = await db.sources.get(sourceId);
  const statusAfter = statusOf(after?.check);
  await audit(s, flagged.length ? 'note-saved-untrusted' : 'note-saved', statusBefore, statusAfter, flagged.length ? `Note reads like an instruction to an AI (${flagged.length} match). Stored as plain text; no rule, status or source changed.` : 'Plain note');
  return { flagged, statusBefore, statusAfter };
}
