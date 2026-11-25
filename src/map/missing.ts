import type { Source } from '@/core/contracts';

/** Works that several of the student's sources cite and the library does not have. Counted from reference lists, no AI. */
export interface Missing { id: string; by: Source[] }

export function sharedMissing(sources: Source[], min = 2, max = 10): { list: Missing[]; withList: number; without: number } {
  const recs = sources.filter((s) => s.record);
  const withList = recs.filter((s) => s.record!.references?.length);
  const have = new Set(recs.map((s) => s.record!.openalexId).filter((x): x is string => !!x));
  const by = new Map<string, Source[]>();
  for (const s of withList) for (const id of new Set(s.record!.references)) if (!have.has(id)) by.set(id, [...(by.get(id) ?? []), s]);
  const list = [...by]
    .filter(([, l]) => l.length >= min)
    .map(([id, l]) => ({ id, by: l }))
    .sort((a, b) => b.by.length - a.by.length || a.id.localeCompare(b.id))
    .slice(0, max);
  return { list, withList: withList.length, without: recs.length - withList.length };
}
