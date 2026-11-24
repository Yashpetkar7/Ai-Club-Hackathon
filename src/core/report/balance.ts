import type { Source } from '@/core/contracts';

export interface Balance { total: number; withRecord: number; oldest?: number; newest?: number; openAccess: number; preprints: number; topVenue?: { name: string; count: number }; topAuthor?: { name: string; count: number }; decades: [string, number][]; notes: string[] }

/** What the student's library leans on. Counts only what the records say. */
export function balance(sources: Source[]): Balance {
  const recs = sources.map((s) => s.record).filter((r): r is NonNullable<typeof r> => !!r);
  const years = recs.map((r) => r.year).filter((y): y is number => !!y);
  const top = (xs: string[]) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    const b = [...m].sort((a, z) => z[1] - a[1])[0];
    return b ? { name: b[0], count: b[1] } : undefined;
  };
  const dec = new Map<string, number>();
  for (const y of years) dec.set(`${Math.floor(y / 10) * 10}s`, (dec.get(`${Math.floor(y / 10) * 10}s`) ?? 0) + 1);
  const topVenue = top(recs.map((r) => r.container).filter((x): x is string => !!x));
  const topAuthor = top(recs.flatMap((r) => [...new Set(r.authors.map((a) => [a.family, a.given?.[0]].filter(Boolean).join(', ')))]));
  const preprints = recs.filter((r) => /posted-content|preprint/.test(r.type ?? '')).length;
  const n = recs.length;
  const notes: string[] = [];
  if (n >= 4 && topVenue && topVenue.count / n > 0.5) notes.push(`More than half come from ${topVenue.name}.`);
  if (n >= 4 && topAuthor && topAuthor.count / n > 0.5) notes.push(`${topAuthor.name} is an author on more than half.`);
  if (n >= 4 && years.length && Math.max(...years) - Math.min(...years) <= 2) notes.push('All are from a span of two years.');
  if (n >= 3 && preprints / n > 0.5) notes.push('More than half are preprints.');
  return { total: sources.length, withRecord: n, openAccess: recs.filter((r) => r.openAccessUrl).length, preprints, decades: [...dec].sort(), notes, ...(years.length ? { oldest: Math.min(...years), newest: Math.max(...years) } : {}), ...(topVenue ? { topVenue } : {}), ...(topAuthor ? { topAuthor } : {}) };
}
