import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import { readPassages } from '@/agents/reader';
import { askAi, OppositePhrase, SearchPhrases } from '@/core/aiClient';
import { claimFromQuestion, readPaper } from '@/core/analyst/analyst';
import { claimQuery, closestSentence, oppositeQuery, side } from '@/core/challenge/challenge';
import { preflight } from '@/core/cite/preflight';
import type { LogEvent, Project, ReferenceCheck, RegistryRecord, Source } from '@/core/contracts';
import { registries, searchPapers } from '@/core/registries';
import { reviewProject } from '@/core/review/review';
import { cleanTitle } from '@/core/verify/normalise';
import { checkReference } from '@/core/verify/verdict';
import { record as log } from '@/log/log';
import { agentAllowed, type AgentId } from '@/policy/policy';
import { suggestQueries } from '@/core/suggest';
import { editSource } from '@/store/actions';
import { db } from '@/store/db';

/**
 * The team working in order, stopping at every gate. Nobody here can pass a gate: only the student's clicks do,
 * through the same actions the pages use. Agents hand over plain data, never instructions.
 */
export type AgentState = 'idle' | 'working' | 'waiting' | 'done' | 'locked' | 'failed';
export interface AgentStatus { state: AgentState; note: string }
export interface TeamRun {
  running: boolean;
  stopping: boolean;
  agents: Partial<Record<AgentId, AgentStatus>>;
  /** What the team is waiting for the student to decide. */
  gate?: { n: 1 | 2 | 3; text: string };
  queries?: { text: string; by: string }[];
  lines: { at: number; agent: AgentId; text: string }[];
}
export interface Hit { key: string; record: RegistryRecord; query: string; check?: ReferenceCheck; choice?: 'kept' | 'skipped' }

/** Search results by plan, shared with the Find page so nothing is searched twice. */
export const hitCache = new Map<string, { hits: Hit[]; notes: string[] }>();
export const planKeyOf = (p: Project): string => `${p.id}|${p.plan?.approvedAt ?? ''}`;

const runs = new Map<string, TeamRun>();
const listeners = new Set<() => void>();
const EMPTY: TeamRun = { running: false, stopping: false, agents: {}, lines: [] };
const get = (id: string): TeamRun => runs.get(id) ?? EMPTY;
function put(id: string, patch: Partial<TeamRun>): void {
  runs.set(id, { ...get(id), ...patch });
  for (const l of listeners) l();
}
export const useTeam = (id: string): TeamRun =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => get(id),
    () => EMPTY,
  );
export const stopTeam = (id: string): void => put(id, { stopping: true });
export const forgetTeam = (): void => {
  runs.clear();
  hitCache.clear();
  for (const l of listeners) l();
};

class Stopped extends Error {}

/** Where each agent stands, from the log alone, so the board is right after a reload too. */
const DONE: [AgentId, RegExp][] = [
  ['planner', /^(ai\.plan|planner\.fallback|gate1\.)/],
  ['scout', /^scout\./],
  ['checker', /^source\.(added|rechecked)$|^checker\./],
  ['analyst', /^analyst\./],
  ['reader', /^ai\.read$/],
  ['quote-guard', /^gate3\.|^support\./],
  ['challenger', /^challenger\.|^ai\.challenge$/],
  ['reviewer', /^reviewer\./],
  ['clerk', /^export$|^clerk\./],
];
export function lastActions(events: LogEvent[]): Partial<Record<AgentId, LogEvent>> {
  const out: Partial<Record<AgentId, LogEvent>> = {};
  for (const e of events) for (const [id, re] of DONE) if (re.test(e.action)) out[id] = e;
  return out;
}

export async function runTeam(projectId: string): Promise<void> {
  if (get(projectId).running) return;
  put(projectId, { running: true, stopping: false, agents: {}, lines: [] });
  runs.set(projectId, { ...get(projectId) });
  delete runs.get(projectId)!.gate;
  const status = (agent: AgentId, state: AgentState, note: string) => {
    if (get(projectId).stopping) throw new Stopped();
    put(projectId, { agents: { ...get(projectId).agents, [agent]: { state, note } }, lines: [...get(projectId).lines, { at: Date.now(), agent, text: note }].slice(-60) });
  };
  const wait = (n: 1 | 2 | 3, text: string) => put(projectId, { gate: { n, text } });
  try {
    await steps(projectId, status, wait);
  } catch (e) {
    const agents = { ...get(projectId).agents };
    for (const k of Object.keys(agents) as AgentId[]) if (agents[k]?.state === 'working') agents[k] = e instanceof Stopped ? { state: 'idle', note: 'Stopped by you.' } : { state: 'failed', note: e instanceof Error ? e.message : 'Stopped.' };
    put(projectId, { agents });
  }
  put(projectId, { running: false, stopping: false });
}

async function steps(id: string, status: (a: AgentId, s: AgentState, n: string) => void, wait: (n: 1 | 2 | 3, t: string) => void): Promise<void> {
  const project = async (): Promise<Project> => {
    const p = await db.projects.get(id);
    if (!p) throw new Error('This project was removed.');
    return p;
  };
  const sourcesNow = () => db.sources.where('projectId').equals(id).toArray();
  let p = await project();

  // 1. Planner, then gate 1
  if (!p.plan?.approvedAt) {
    status('planner', 'working', 'Turning your question into searches.');
    const plain = suggestQueries(p.question);
    let queries = plain.map((text) => ({ text, by: 'plain code' }));
    if (agentAllowed('planner', p.aiLevel)) {
      const r = await askAi(p, 'plan', { question: p.question, current: plain }, SearchPhrases);
      if (r.ok) queries = [...queries, ...r.data.queries.filter((q) => !plain.includes(q)).map((text) => ({ text, by: `AI (${r.model})` }))].slice(0, 5);
      else await log(id, 'code', 'planner.fallback', 'The AI was not available');
    }
    put(id, { queries });
    status('planner', 'waiting', `${queries.length} searches suggested. Waiting for you.`);
    wait(1, 'Approve the searches. Nothing is searched before that.');
    return;
  }
  status('planner', 'done', `${p.plan.queries.length} searches, approved by you.`);

  // 2. Scout and Checker, then gate 2
  const key = planKeyOf(p);
  let found = hitCache.get(key);
  const kept = await sourcesNow();
  if (!found && kept.length === 0) {
    const hits = new Map<string, Hit>();
    const notes = new Set<string>();
    for (const [i, q] of p.plan.queries.entries()) {
      status('scout', 'working', `Search ${i + 1} of ${p.plan.queries.length}: ${q}`);
      try {
        const r = await searchPapers(q, { perPage: 8, ...(p.plan.fromYear ? { fromYear: p.plan.fromYear } : {}) });
        if (r.note) notes.add(r.note);
        for (const rec of r.records) {
          const k = rec.doi ?? cleanTitle(rec.title).toLowerCase();
          if (!hits.has(k)) hits.set(k, { key: k, record: rec, query: q });
        }
      } catch {
        notes.add('One search did not get an answer. Try again in a minute.');
      }
    }
    if (!hits.size) {
      status('scout', 'failed', notes.size ? [...notes].join(' ') : 'No registry had a match. We will not make one up.');
      wait(1, 'Change the searches and try again.');
      return;
    }
    await log(id, 'code', 'scout.searched', `${p.plan.queries.length} searches, ${hits.size} works found`);
    status('scout', 'done', `${hits.size} works found in scholarly registries.`);
    const list = [...hits.values()];
    let next = 0;
    let done = 0;
    const worker = async () => {
      while (next < list.length) {
        const h = list[next++]!;
        const rec = h.record;
        const t = cleanTitle(rec.title);
        const check = await checkReference({ raw: t, title: t, authors: rec.authors.slice(0, 6).map((a) => a.family), ...(rec.year ? { year: rec.year } : {}), ...(rec.doi ? { doi: rec.doi } : {}) }, registries);
        h.check = check.record ? { ...check, record: { ...check.record, abstract: check.record.abstract ?? rec.abstract } as RegistryRecord } : check;
        status('checker', 'working', `Checked ${++done} of ${list.length}.`);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    found = { hits: list, notes: [...notes] };
    hitCache.set(key, found);
    await log(id, 'code', 'checker.ran', `${list.length} checked, ${list.filter((h) => h.check?.verdict === 'confirmed').length} confirmed`);
  } else status('scout', 'done', kept.length ? 'Your searches have run.' : 'Results are waiting in Find.');
  if (found) {
    const good = found.hits.filter((h) => h.check?.verdict === 'confirmed').length;
    status('checker', 'done', `${good} of ${found.hits.length} confirmed. ${found.hits.length - good ? `${found.hits.length - good} flagged, never shown as confirmed.` : ''}`.trim());
  } else status('checker', 'done', `${kept.filter((s) => s.check?.verdict === 'confirmed').length} of ${kept.length} in your library confirmed.`);
  const mine = (await sourcesNow()).filter((s) => s.keys.approved);
  if (!mine.length) {
    wait(2, 'Keep or skip each paper. The team reads only what you keep.');
    return;
  }

  // 3. Analyst
  let read = 0;
  let sentencesPlaced = 0;
  const readable: Source[] = [];
  for (const s of mine) {
    status('analyst', 'working', `Reading ${read + 1} of ${mine.length}.`);
    let text = s.text;
    if (!text && s.record?.doi) {
      const rec = await registries.openalexByDoi(s.record.doi).catch(() => null);
      if (rec?.abstract) {
        text = rec.abstract;
        await editSource(s.id, { text, textOrigin: 'abstract' });
      }
    }
    read++;
    if (!text) continue;
    readable.push({ ...s, text });
    sentencesPlaced += readPaper(text).placed;
  }
  await log(id, 'code', 'analyst.read', `${readable.length} of ${mine.length} papers read, ${sentencesPlaced} sentences sorted`);
  status('analyst', 'done', `${readable.length} of ${mine.length} papers read. ${sentencesPlaced} of their own sentences sorted.`);

  // 4. Reader, only when allowed
  p = await project();
  if (!agentAllowed('reader', p.aiLevel)) status('reader', 'locked', `Locked at AI level ${p.aiLevel}.`);
  else {
    status('reader', 'working', 'Pointing at sentences that answer your question.');
    const r = await readPassages(p, p.question, readable);
    if (r.ok) status('reader', 'done', r.data.length ? `Pointed at ${r.data.length} sentences by number. See Ask.` : 'Found no sentence that answers it.');
    else status('reader', 'idle', 'Not available, so plain code works alone.');
  }

  // 5. Challenger
  const claim = claimFromQuestion(p.question);
  status('challenger', 'working', `Looking for both sides of “${claim}”.`);
  const asks = [claimQuery(claim), oppositeQuery(claim)];
  if (agentAllowed('challenger', p.aiLevel)) {
    const r = await askAi(p, 'challenge', { claim }, OppositePhrase);
    if (r.ok) asks.push(r.data.query);
  }
  const sides = { same: 0, other: 0, unclear: 0 };
  const seen = new Set<string>();
  let answered = 0;
  for (const q of asks) {
    try {
      const r = await searchPapers(q, { perPage: 10 });
      answered++;
      for (const rec of r.records) {
        const k = rec.doi ?? rec.title;
        const s = rec.abstract && !seen.has(k) ? closestSentence(rec.abstract, claim) : null;
        seen.add(k);
        if (s) sides[side(claim, s.text)]++;
      }
    } catch {
      /* counted below */
    }
    status('challenger', 'working', `${seen.size} papers compared.`);
  }
  if (!answered) status('challenger', 'failed', 'No registry answered, so nothing was compared.');
  else {
    await log(id, 'code', 'challenger.searched', `${claim.slice(0, 160)} | ${seen.size} works compared, ${sides.other} lean the other way`);
    status('challenger', 'done', `${sides.same} point the same way, ${sides.other} the other way, ${sides.unclear} unclear. Read them in Challenge.`);
  }

  // 6. Quote guard, then gate 3
  const claims = await db.claims.where('projectId').equals(id).toArray();
  const count = (l: string) => claims.filter((c) => c.label === l && c.decision !== 'rejected').length;
  if (!claims.length) status('quote-guard', 'waiting', 'No claims yet. Write one in Evidence and it is compared with the exact sentence.');
  else status('quote-guard', 'done', `${count('verified')} Verified, ${count('reported')} not checked, ${count('disputed')} Disputed.`);

  // 7. Reviewer and Clerk
  status('reviewer', 'working', 'Reading the whole project.');
  const [sources, events, draft] = await Promise.all([sourcesNow(), db.log.where('projectId').equals(id).sortBy('seq'), db.drafts.get(id)]);
  const r = reviewProject({ projectId: id, sources, claims, draft: draft?.html ?? '', log: events });
  const fix = r.findings.filter((f) => f.level === 'fix').length;
  const look = r.findings.filter((f) => f.level === 'look').length;
  await log(id, 'code', 'reviewer.ran', `${fix} to fix, ${look} to look at`);
  status('reviewer', 'done', `${fix} to fix, ${look} to look at again.`);
  const pf = preflight(sources);
  await log(id, 'code', 'clerk.prepared', `${pf.ready.length} ready, ${pf.withReason.length} with a reason, ${pf.blocked.length} stay behind`);
  status('clerk', 'done', `${pf.ready.length + pf.withReason.length} references ready, ${pf.blocked.length} stay behind.`);
  if (!claims.length) wait(3, 'Write and accept your claims. The team cannot decide for you.');
}

export const Phrases = z.object({ queries: z.array(z.string()) });
