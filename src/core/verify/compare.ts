import type { FieldDiff, RawReference, RegistryRecord } from '@/core/contracts';
import { POLICY } from '@/policy/policy';
import { addedWords, cleanTitle, familyKey, sameFamily, titleContained, titleInText, titleScore, tokens } from './normalise';

export interface Comparison {
  title: number;
  authors: number;
  firstAuthor: boolean;
  /** The registry has no authors to compare with. Not the student's mistake. */
  authorsUnknown: boolean;
  yearGap: number | null;
  fields: FieldDiff[];
}

const authorList = (r: RegistryRecord): string => {
  const f = r.authors.map((a) => a.family);
  if (!f.length) return 'none listed';
  return f.length > 4 ? `${f.slice(0, 3).join(', ')} and ${f.length - 3} more` : f.join(', ');
};

/** Compares what the student wrote with one registry record, field by field. */
export function compare(ref: RawReference, rec: RegistryRecord): Comparison {
  const th = POLICY.thresholds;
  let title = 0;
  if (ref.title) {
    title = titleScore(ref.title, rec.title);
    if (title < th.titleMatch && (titleContained(ref.title, rec.title) || titleContained(rec.title, ref.title))) title = Math.max(title, 0.95);
    // Found by our own Integrity Lab: invented words added to a real title used to pass.
    const added = addedWords(ref.title, rec.title, [rec.container, rec.publisher, ...rec.authors.map((a) => a.family)].filter(Boolean).join(' '));
    if (title >= th.titleMatch && added.length) title = th.titleMatch - 0.01;
    // Only spelling, spacing or hyphens differ.
    else if (title < th.titleMatch && !added.length && !addedWords(rec.title, ref.title).length) title = 0.95;
  }
  if (!ref.title && titleInText(rec.title, ref.raw)) title = 1;

  const given = ref.authors ?? [];
  let authors = 1;
  let firstAuthor = true;
  let authorsUnknown = false;
  if (given.length && rec.authors.length) {
    const hits = given.filter((g) => rec.authors.some((a) => sameFamily(g, a.family)));
    authors = hits.length / given.length;
    firstAuthor = sameFamily(given[0]!, rec.authors[0]!.family) || rec.authors.some((a) => sameFamily(given[0]!, a.family) && given.length === 1);
  } else if (given.length) {
    authors = 0;
    firstAuthor = false;
    authorsUnknown = true;
  } else if (!given.length && rec.authors.length && tokens(ref.raw).length > 6 && ref.raw !== ref.title) {
    const raw = ` ${tokens(ref.raw).join(' ')} `;
    firstAuthor = raw.includes(` ${familyKey(rec.authors[0]!.family)} `);
    authors = firstAuthor ? 1 : 0;
  }
  const yearGap = ref.year && rec.year ? Math.abs(ref.year - rec.year) : null;

  const fields: FieldDiff[] = [];
  if (ref.title) fields.push({ field: 'title', given: ref.title, registry: cleanTitle(rec.title), score: title, ok: title >= th.titleMatch });
  if (given.length) fields.push({ field: 'authors', given: given.join(', '), registry: authorList(rec), score: authors, ok: authors >= 0.999 && firstAuthor });
  if (ref.year) fields.push({ field: 'year', given: String(ref.year), registry: rec.year ? String(rec.year) : 'not stated', score: yearGap === null ? 1 : Math.max(0, 1 - yearGap / 5), ok: yearGap === null || yearGap <= th.yearTolerance });
  return { title, authors, firstAuthor, authorsUnknown, yearGap, fields };
}

/** Ranks candidates from a search. Title first, then authors, then year. */
export const rank = (c: Comparison): number => c.title + (c.firstAuthor ? 0.15 : 0) + c.authors * 0.15 - Math.min(c.yearGap ?? 0, 10) * 0.02;
