import type { RegistryRecord, Source } from '@/core/contracts';
import { cleanTitle, sameFamily, titleContained, tokens } from '@/core/verify/normalise';

/**
 * The same work saved twice, for example a preprint and the printed paper. Plain code.
 * It never merges anything. The student looks at both and decides.
 */
export interface Pair {
  a: Source;
  b: Source;
  /** The two ids in order, so a decision can be remembered. */
  key: string;
  why: string;
}

const titleOf = (s: Source): string => (s.record ? cleanTitle(s.record.title) : (s.raw?.title ?? ''));
const families = (s: Source): string[] => s.record?.authors.map((a) => a.family) ?? (s.raw?.authors ?? []).map((a) => a.split(',')[0]!.trim());
const yearOf = (s: Source): number | undefined => s.record?.year ?? s.raw?.year;
export const isPreprint = (r: Pick<RegistryRecord, 'type' | 'container'> | undefined): boolean => !!r && (/^(posted-content|preprint|text)$/i.test(r.type ?? '') || /arxiv|ssrn|biorxiv|medrxiv|preprint/i.test(r.container ?? ''));

export const pairKey = (x: string, y: string): string => [x, y].sort().join('|');

/** The words of a title in a fixed order. Numbers stay, so "Part 1" and "Part 2" are different works. */
const bag = (t: string): string => tokens(t.replace(/-/g, ' ')).sort().join(' ');

function sameTitle(a: string, b: string): boolean {
  const x = bag(a);
  if (!x || x.split(' ').length < 3) return false;
  return x === bag(b) || titleContained(a, b) || titleContained(b, a);
}

function sameAuthor(a: Source, b: Source): boolean | null {
  const x = families(a);
  const y = families(b);
  if (!x.length || !y.length) return null;
  return x.some((f) => sameFamily(f, y[0]!)) && y.some((f) => sameFamily(f, x[0]!));
}

export function whySame(a: Source, b: Source): string | null {
  const da = a.record?.doi;
  const dbb = b.record?.doi;
  if (da && dbb && da === dbb) return 'They have the same DOI.';
  if (da && dbb && (a.record?.versions?.includes(dbb) || b.record?.versions?.includes(da))) return 'The publisher says one is a version of the other.';
  if (!sameTitle(titleOf(a), titleOf(b))) return null;
  const who = sameAuthor(a, b);
  if (who === false) return null;
  const ya = yearOf(a);
  const yb = yearOf(b);
  // A preprint can come out years before the printed paper. A new edition of a book is another work.
  if (ya && yb && Math.abs(ya - yb) > 4) return null;
  const pre = isPreprint(a.record) !== isPreprint(b.record);
  return pre ? 'Same title and authors. One looks like the preprint of the other.' : who === null ? 'Same title. One of them lists no authors.' : 'Same title and authors.';
}

export function findDuplicates(sources: Source[]): Pair[] {
  const out: Pair[] = [];
  for (let i = 0; i < sources.length; i++)
    for (let j = i + 1; j < sources.length; j++) {
      const why = whySame(sources[i]!, sources[j]!);
      if (why) out.push({ a: sources[i]!, b: sources[j]!, key: pairKey(sources[i]!.id, sources[j]!.id), why });
    }
  return out;
}

/** A search result that is already in the library under another DOI. */
export function alreadyHave(record: RegistryRecord, library: Source[]): Source | undefined {
  const asSource = { id: '?', record } as Source;
  return library.find((s) => whySame(asSource, s));
}

/** Which of the two to suggest keeping. Printed before preprint, then confirmed, then the one with more text. */
export function better(a: Source, b: Source): Source {
  const score = (s: Source): number => (s.record && !isPreprint(s.record) ? 8 : 0) + (s.check?.verdict === 'confirmed' ? 4 : 0) + (s.keys.approved ? 2 : 0) + (s.textOrigin === 'pdf' || s.textOrigin === 'fulltext' ? 1 : 0);
  return score(b) > score(a) ? b : a;
}
