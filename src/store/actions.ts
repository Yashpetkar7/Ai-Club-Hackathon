import { exportable, VERDICT_TEXT, type AiLevel, type CitationStyle, type Project, type RawReference, type ReferenceCheck, type RegistryRecord, type SearchPlan, type Source, type SourceOrigin } from '@/core/contracts';
import { cleanTitle } from '@/core/verify/normalise';
import { record as log } from '@/log/log';
import { sourceIssues } from '@/policy/apply';
import { POLICY } from '@/policy/policy';
import { db, newId } from './db';

/** The only functions pages use to change data. Each one writes to the log. */

export async function createProject(question: string, style: CitationStyle = 'apa', aiLevel: AiLevel = 1): Promise<Project> {
  const p: Project = { id: newId(), question: question.trim(), style, aiLevel, createdAt: new Date().toISOString() };
  await db.projects.add(p);
  await log(p.id, 'student', 'project.created', p.question);
  return p;
}

export async function setAiLevel(projectId: string, level: AiLevel): Promise<void> {
  await db.projects.update(projectId, { aiLevel: level });
  await log(projectId, 'student', 'ai.level', `AI permission level set to ${level}`);
}

export async function setStyle(projectId: string, style: CitationStyle): Promise<void> {
  await db.projects.update(projectId, { style });
  await log(projectId, 'student', 'style.set', style);
}

/** Gate 1. Searching starts only after this. */
export async function approvePlan(projectId: string, plan: SearchPlan): Promise<void> {
  const queries = plan.queries.map((q) => q.trim()).filter(Boolean).slice(0, 5);
  if (!queries.length) throw new Error('Add at least one search.');
  await db.projects.update(projectId, { plan: { ...plan, queries, approvedAt: new Date().toISOString() } });
  await log(projectId, 'student', 'gate1.plan-approved', queries.join(' | '));
}

/** Found by a registry turns the first key. Plain code turns the second. The student turns the third in approveSource. */
export async function addSource(projectId: string, origin: SourceOrigin, input: { record?: RegistryRecord; raw?: RawReference; check?: ReferenceCheck; approve?: boolean; folder?: string }): Promise<Source> {
  const rec = input.check?.record ?? input.record;
  const same = (s: Source): boolean => (rec?.doi ? s.record?.doi === rec.doi : rec ? s.record?.id === rec.id : origin === 'web' ? !!input.raw?.url && s.raw?.url === input.raw.url : !s.record && !!input.raw && s.raw?.raw === input.raw.raw);
  const dup = (await db.sources.where('projectId').equals(projectId).toArray()).find(same);
  if (dup) return dup;
  const s: Source = {
    id: newId(),
    projectId,
    origin,
    keys: { found: !!rec, checked: input.check?.verdict === 'confirmed', approved: false },
    tags: [],
    notes: '',
    addedAt: new Date().toISOString(),
    ...(rec ? { record: rec } : {}),
    ...(input.raw ? { raw: input.raw } : {}),
    ...(input.check ? { check: input.check } : {}),
    ...(input.folder ? { folder: input.folder } : {}),
    ...(rec?.abstract ? { text: rec.abstract, textOrigin: 'abstract' as const } : {}),
  };
  await db.sources.add(s);
  await log(projectId, 'code', 'source.added', `${rec?.title ?? input.raw?.raw.slice(0, 120) ?? 'source'} [${input.check ? VERDICT_TEXT[input.check.verdict].label : 'unchecked'}]`);
  if (input.approve) return approveSource(s.id);
  return s;
}

/** Approve a clean source, or keep a flagged one with a written reason. */
export async function approveSource(sourceId: string, reason?: string): Promise<Source> {
  const s = await db.sources.get(sourceId);
  if (!s) throw new Error('This source no longer exists.');
  const clean = s.keys.found && s.keys.checked && !sourceIssues(s).length;
  if (!clean && (reason ?? '').trim().length < POLICY.overrideReasonMinChars) throw new Error(`Write at least ${POLICY.overrideReasonMinChars} characters on why you are keeping a source that is not confirmed or is outside house rules.`);
  const keys = { ...s.keys, approved: true };
  const patch: Partial<Source> = { keys, ...(clean ? {} : { keptWithReason: reason!.trim() }) };
  await db.sources.update(sourceId, patch);
  await log(s.projectId, 'student', clean ? 'source.approved' : 'source.kept-with-reason', `${s.record?.title ?? s.raw?.raw.slice(0, 120)}${clean ? '' : ` | reason: ${reason!.trim()}`}`);
  return { ...s, ...patch };
}

export async function removeSource(sourceId: string): Promise<void> {
  const s = await db.sources.get(sourceId);
  if (!s) return;
  await db.sources.delete(sourceId);
  await log(s.projectId, 'student', 'source.removed', s.record?.title ?? s.raw?.raw.slice(0, 120) ?? sourceId);
}

export async function editSource(sourceId: string, patch: Pick<Partial<Source>, 'folder' | 'tags' | 'notes' | 'text' | 'textOrigin' | 'citeTitle' | 'pdfPages'>): Promise<void> {
  const s = await db.sources.get(sourceId);
  if (!s) return;
  // The student may fix capitals. Changing the words would cite a work that does not exist.
  if (patch.citeTitle !== undefined && patch.citeTitle.toLowerCase() !== cleanTitle(s.record?.title ?? s.raw?.title ?? '').toLowerCase()) throw new Error('Only capital letters may change. The words must stay as the registry has them.');
  await db.sources.update(sourceId, patch);
  const what = Object.keys(patch).filter((k) => k !== 'textOrigin' && k !== 'pdfPages').join(', ');
  await log(s.projectId, 'student', 'source.edited', `${s.record?.title ?? s.raw?.raw.slice(0, 120) ?? sourceId} | ${what}`);
}

/** Ask the registries again. A worse answer takes the student's approval back, unless they wrote a reason. */
export async function recheckSource(sourceId: string, check: ReferenceCheck): Promise<void> {
  const s = await db.sources.get(sourceId);
  if (!s) return;
  const rec = check.record ?? s.record;
  const checked = check.verdict === 'confirmed';
  const keys = { found: !!rec, checked, approved: s.keys.approved && (checked || !!s.keptWithReason) };
  await db.sources.update(sourceId, { check, keys, ...(rec ? { record: rec } : {}), ...(!s.text && rec?.abstract ? { text: rec.abstract, textOrigin: 'abstract' as const } : {}) });
  await log(s.projectId, 'code', 'source.rechecked', `${rec?.title ?? s.raw?.raw.slice(0, 120)} [${VERDICT_TEXT[check.verdict].label}]`);
}

/** A source the student looked at and left out. */
export const skipSource = (projectId: string, title: string): Promise<unknown> => log(projectId, 'student', 'source.skipped', title);

/** What the student did with suggestions from an AI. Counts for the AI-use statement come only from these entries. */
export async function recordAiDecision(projectId: string, task: 'plan' | 'read' | 'challenge', d: { kept: string[]; changed: string[]; rejected: string[] }): Promise<void> {
  await log(projectId, 'student', `ai.${task}.decided`, JSON.stringify(d));
}

/** What may be cited: all three keys, or kept with a written reason (shown as such). */
export const citable = (s: Source, policy = POLICY): boolean => (exportable(s) && !sourceIssues(s, policy).length) || (s.keys.approved && !!s.keptWithReason && (!!s.record || s.origin === 'web' || s.origin === 'manual'));

/** One button. Removes everything this site has stored in this browser. */
export async function deleteEverything(): Promise<void> {
  await db.transaction('rw', [db.projects, db.sources, db.claims, db.log, db.drafts], async () => {
    await Promise.all([db.projects.clear(), db.sources.clear(), db.claims.clear(), db.log.clear(), db.drafts.clear()]);
  });
}
