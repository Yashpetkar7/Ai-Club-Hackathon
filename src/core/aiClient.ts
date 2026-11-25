import { z } from 'zod';
import type { Project } from './contracts';
import { hasNoAi } from '@/core/registries/http';
import { record } from '@/log/log';
import { agentAllowed, POLICY, type AgentId } from '@/policy/policy';
import { db } from '@/store/db';

/** The page side of the AI gateway. Checks the level and the cap before asking, and logs every call. */
export type AiResult<T> = { ok: true; data: T; model: string } | { ok: false; reason: 'locked' | 'cap' | 'unavailable' | 'bad-answer' };

const AGENT = { plan: 'planner', read: 'reader', challenge: 'challenger' } as const satisfies Record<string, AgentId>;

export const aiCallsUsed = (projectId: string): Promise<number> => db.log.where('projectId').equals(projectId).filter((e) => e.actor === 'ai').count();

export async function askAi<T>(project: Project, task: keyof typeof AGENT, input: unknown, shape: z.ZodType<T>): Promise<AiResult<T>> {
  if (!agentAllowed(AGENT[task], project.aiLevel)) return { ok: false, reason: 'locked' };
  if ((await aiCallsUsed(project.id)) >= POLICY.maxAiCallsPerProject) return { ok: false, reason: 'cap' };
  if (await hasNoAi()) return { ok: false, reason: 'unavailable' };
  let body: unknown;
  try {
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task, level: project.aiLevel, input }), signal: AbortSignal.timeout(25_000) });
    body = await r.json();
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  const env = z.object({ ok: z.literal(true), data: z.unknown(), model: z.string().default('unknown model') }).safeParse(body);
  if (!env.success) return { ok: false, reason: 'unavailable' };
  const data = shape.safeParse(env.data.data);
  await record(project.id, 'ai', `ai.${task}`, data.success ? 'answer used as a suggestion' : 'answer rejected: wrong shape', { model: env.data.model, prompt: JSON.stringify(input).slice(0, 2000) });
  return data.success ? { ok: true, data: data.data, model: env.data.model } : { ok: false, reason: 'bad-answer' };
}

/** A search phrase is words to search with. Anything that looks like a reference is thrown away. */
export const isSearchPhrase = (s: string): boolean => {
  const t = s.trim();
  return t.length >= 4 && t.length <= 120 && !/10\.\d{4,9}\/|https?:|\(\s*\d{4}|\bet al\b|[<>{}]/i.test(t) && t.split(/\s+/).length <= 14;
};
export const SearchPhrases = z.object({ queries: z.array(z.string()).max(8) }).transform((d) => ({ queries: [...new Set(d.queries.map((q) => q.trim()))].filter(isSearchPhrase).slice(0, 5) }));
export const OppositePhrase = z.object({ query: z.string() }).refine((d) => isSearchPhrase(d.query));
