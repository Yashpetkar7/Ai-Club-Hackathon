import { titleOf } from '@/core/cite/preflight';
import type { RawReference, ReferenceCheck, Source } from '@/core/contracts';
import { registries, retractedReferences } from '@/core/registries';
import { withFreshAnswers } from '@/core/registries/http';
import { checkReference, type Registries } from '@/core/verify/verdict';
import { record as log } from '@/log/log';
import { recheckSource } from '@/store/actions';
import { db } from '@/store/db';

/** Asks the registries about a library again, for retractions, warnings and corrections since the last time. */
export interface Watched {
  checked: number;
  /** Registries did not answer. The earlier result stays, with its date. */
  unsure: string[];
  retracted: string[];
  concern: string[];
  corrected: string[];
  /** Sources whose own reference list holds retracted work. */
  leaning: string[];
  /** Sources OpenAlex has no reference list for, so nothing could be said. */
  noList: number;
  stopped: boolean;
  /** Two sources in a row got no answer, so the rest were not asked. */
  silent: boolean;
}

export interface Ask { registries: Registries; retractedReferences: typeof retractedReferences }
const LIVE: Ask = { registries, retractedReferences };

/** What to look up again: what the student wrote, or the record we already hold. */
export const rawFor = (s: Source): RawReference =>
  s.raw ?? { raw: titleOf(s), title: titleOf(s), ...(s.record?.doi ? { doi: s.record.doi } : {}), ...(s.record?.year ? { year: s.record.year } : {}), ...(s.record ? { authors: s.record.authors.slice(0, 6).map((a) => a.family) } : {}) };

/** A registry that is silent today is not a reason to throw away yesterday's answer. */
const worseOnlyBySilence = (before: ReferenceCheck | undefined, after: ReferenceCheck): boolean => (after.verdict === 'could-not-check' && !!before) || (after.verdict === 'one-registry' && before?.verdict === 'confirmed');

/** Checks one source again. Returns false when a registry was silent and the earlier result was kept. */
export async function checkAgain(s: Source, ask: Ask = LIVE): Promise<{ ok: boolean; check: ReferenceCheck }> {
  const check = await withFreshAnswers(() => checkReference(rawFor(s), ask.registries));
  if (worseOnlyBySilence(s.check, check)) return { ok: false, check };
  await recheckSource(s.id, check);
  return { ok: true, check };
}

export async function watchLibrary(projectId: string, onStep: (n: number, of: number, title: string) => void, stop: () => boolean = () => false, ask: Ask = LIVE): Promise<Watched> {
  const all = (await db.sources.where('projectId').equals(projectId).toArray()).filter((s) => s.record);
  const out: Watched = { checked: 0, unsure: [], retracted: [], concern: [], corrected: [], leaning: [], noList: 0, stopped: false, silent: false };
  let quiet = 0;
  for (const [i, s] of all.entries()) {
    if (stop()) {
      out.stopped = true;
      break;
    }
    const name = titleOf(s);
    onStep(i + 1, all.length, name);
    const r = await checkAgain(s, ask);
    if (r.ok) out.checked++;
    else out.unsure.push(name);
    quiet = r.check.verdict === 'could-not-check' ? quiet + 1 : 0;
    if (quiet >= 2) {
      out.silent = true;
      out.unsure.push(...all.slice(i + 1).map(titleOf));
      break;
    }
    const rec = r.check.record ?? s.record!;
    if (rec.retracted) out.retracted.push(name);
    if (rec.notices?.some((x) => x.kind === 'concern')) out.concern.push(name);
    if (rec.notices?.some((x) => x.kind === 'correction')) out.corrected.push(name);
    const id = rec.openalexId ?? s.record?.openalexId;
    if (!id) {
      out.noList++;
      continue;
    }
    try {
      const items = await withFreshAnswers(() => ask.retractedReferences(id));
      await db.sources.update(s.id, { retractedRefs: { at: new Date().toISOString(), items } });
      if (items.length) out.leaning.push(name);
    } catch {
      if (!out.unsure.includes(name)) out.unsure.push(name);
    }
  }
  await log(projectId, 'code', 'library.watched', `${out.checked} checked again, ${out.retracted.length} retracted, ${out.concern.length} under concern, ${out.corrected.length} corrected, ${out.leaning.length} cite retracted work, ${out.unsure.length} not answered${out.stopped ? ', stopped early' : ''}${out.silent ? ', registries silent' : ''}`);
  return out;
}
