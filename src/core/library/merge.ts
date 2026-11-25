import { judge } from '@/core/claims/label';
import { findQuote } from '@/core/claims/quote';
import { titleOf } from '@/core/cite/preflight';
import type { Source } from '@/core/contracts';
import { pageAt } from '@/core/pdf/pages';
import { record as log } from '@/log/log';
import { db } from '@/store/db';

export interface Merged { moved: number; left: number; textCopied: boolean }

/**
 * Keeps one of two records of the same work. Tags, notes and the folder move over.
 * Text moves only when both have the same DOI, because a preprint and the printed paper can say different things.
 * A claim moves only when its exact words are also in the text of the source that stays.
 */
export async function mergeSources(keepId: string, dropId: string): Promise<Merged> {
  const [keep, drop] = await Promise.all([db.sources.get(keepId), db.sources.get(dropId)]);
  if (!keep || !drop || keep.id === drop.id || keep.projectId !== drop.projectId) throw new Error('One of these sources is no longer here.');
  const sameDoi = !!keep.record?.doi && keep.record.doi === drop.record?.doi;
  const textCopied = !keep.text && !!drop.text && sameDoi;
  const patch: Partial<Source> = {
    tags: [...new Set([...keep.tags, ...drop.tags])],
    notes: [...new Set([keep.notes, drop.notes].map((x) => x.trim()).filter(Boolean))].join('\n'),
    ...(!keep.folder && drop.folder ? { folder: drop.folder } : {}),
    ...(textCopied ? { text: drop.text!, ...(drop.textOrigin ? { textOrigin: drop.textOrigin } : {}), ...(drop.pdfPages ? { pdfPages: drop.pdfPages } : {}) } : {}),
  };
  const after: Source = { ...keep, ...patch };
  let moved = 0;
  let left = 0;
  await db.transaction('rw', [db.sources, db.claims], async () => {
    await db.sources.update(keep.id, patch);
    for (const c of await db.claims.where('sourceId').equals(drop.id).toArray()) {
      const at = c.passage && after.text ? findQuote(c.passage.text, after.text) : null;
      if (!at || !c.passage) {
        left++;
        continue;
      }
      const page = pageAt(after, at.start, at.end);
      // Same words and the same verdict on the source: nothing the label rests on has changed. Otherwise judge again, without the model.
      const same = after.check?.verdict === drop.check?.verdict;
      const j = same ? null : judge(c.text, after, c.passage.text);
      await db.claims.update(c.id, {
        sourceId: after.id,
        passage: { id: `${after.id}:${at.start}`, sourceId: after.id, text: c.passage.text, start: at.start, end: at.end, ...(page ?? {}) },
        ...(j ? { label: j.label, reasons: j.reasons, checks: j.checks } : {}),
      });
      moved++;
    }
    await db.sources.delete(drop.id);
  });
  await log(keep.projectId, 'student', 'source.merged', `Kept “${titleOf(keep)}” (${keep.record?.doi ?? 'no DOI'}), removed ${drop.record?.doi ?? titleOf(drop)}. ${moved} claims moved, ${left} left behind`);
  return { moved, left, textCopied };
}

/** Remembers that the student looked at both and says they are different works. */
export async function notTheSame(projectId: string, key: string, what: string): Promise<void> {
  const p = await db.projects.get(projectId);
  if (!p) return;
  await db.projects.update(projectId, { notTheSame: [...new Set([...(p.notTheSame ?? []), key])] });
  await log(projectId, 'student', 'source.not-the-same', what.slice(0, 200));
}
