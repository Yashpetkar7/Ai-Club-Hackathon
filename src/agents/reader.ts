import { z } from 'zod';
import { sentences } from '@/core/challenge/challenge';
import { askAi, type AiResult } from '@/core/aiClient';
import { coverage } from '@/core/claims/guards';
import type { Project, Source } from '@/core/contracts';
import { findInstructions } from '@/core/pdf/injection';

/** The Reader. It is shown numbered sentences and may only answer with numbers, so it cannot put words in a source's mouth. */
export interface ReadPassage { id: string; text: string; start: number; end: number; source: Source }

const MAX_CHARS = 9000;

export function passagesFor(question: string, sources: Source[], max = 40): ReadPassage[] {
  const all = sources.flatMap((source) => (source.text ? sentences(source.text).map((s) => ({ ...s, source, score: coverage(question, s.text) })) : []));
  const picked = all.filter((p) => !findInstructions(p.text).length && p.text.length < 700).sort((a, b) => b.score - a.score).slice(0, max);
  let used = 0;
  return picked.filter((p) => (used += p.text.length) < MAX_CHARS).map((p, i) => ({ id: `p${i + 1}`, text: p.text, start: p.start, end: p.end, source: p.source }));
}

const PassageIds = z.object({ passages: z.array(z.string().regex(/^p\d{1,3}$/)).max(12) });

/** Returns our own sentences, looked up by number. Numbers we never sent are dropped. */
export async function readPassages(project: Project, question: string, sources: Source[]): Promise<AiResult<ReadPassage[]>> {
  const list = passagesFor(question, sources);
  if (!list.length) return { ok: true, data: [], model: 'none' };
  const r = await askAi(project, 'read', { question, passages: list.map(({ id, text }) => ({ id, text })) }, PassageIds);
  if (!r.ok) return r;
  return { ok: true, model: r.model, data: [...new Set(r.data.passages)].map((id) => list.find((p) => p.id === id)).filter((p): p is ReadPassage => !!p) };
}
