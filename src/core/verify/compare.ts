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
  fields.push(...biblioFields(ref, rec));
  return { title, authors, firstAuthor, authorsUnknown, yearGap, fields };
}

/** Normalised journal, volume, issue and page comparison. Only fields both sides state are compared. */
const STOP = new Set(['the', 'of', 'and', 'in', 'on', 'for', 'a', 'an']);
const jt = (s: string): string[] => tokens(s).filter((w) => !STOP.has(w));
/** "J Econ Perspect" is "Journal of Economic Perspectives": every word a prefix of the next registry word, in order. */
const abbreviates = (a: string[], b: string[]): boolean => {
  let i = 0;
  for (const w of a) {
    while (i < b.length && !b[i]!.startsWith(w)) i++;
    if (i >= b.length) return false;
    i++;
  }
  return a.length > 0;
};
export function sameJournal(given: string, registry: string): boolean {
  const a = jt(given);
  const b = jt(registry);
  if (!a.length || !b.length) return true;
  if (a.join(' ') === b.join(' ')) return true;
  return abbreviates(a, b) || abbreviates(b, a);
}
const pageRange = (p: string): [string, string | null] => {
  const [s0, e0] = p.replace(/[–—−]/g, '-').replace(/\s+/g, '').toLowerCase().split('-');
  const start = s0 ?? '';
  let end = e0 ?? null;
  // 436-44 means 436-444.
  if (end && /^\d+$/.test(start) && /^\d+$/.test(end) && end.length < start.length) end = start.slice(0, start.length - end.length) + end;
  return [start, end];
};
export function samePages(given: string, registry: string): boolean {
  const [gs, ge] = pageRange(given);
  const [rs, re] = pageRange(registry);
  if (gs !== rs) return false;
  return !ge || !re || ge === re;
}
const digits = (s: string): string => s.replace(/\D+/g, '');
const preprint = (r: RegistryRecord): boolean => /^(posted-content|preprint|text)$/i.test(r.type ?? '') || /arxiv|ssrn|biorxiv|medrxiv|preprint|zenodo|research square/i.test(r.container ?? '');

function biblioFields(ref: RawReference, rec: RegistryRecord): FieldDiff[] {
  // A preprint record is another version of the work, so its venue and pages are not the student's mistake.
  if (preprint(rec)) return [];
  const out: FieldDiff[] = [];
  if (ref.container && rec.container && rec.type !== 'book') {
    const ok = sameJournal(ref.container, rec.container);
    out.push({ field: 'container', given: ref.container, registry: rec.container, score: ok ? 1 : 0, ok });
  }
  if (ref.volume && rec.volume && digits(rec.volume)) {
    const ok = digits(ref.volume) === digits(rec.volume);
    out.push({ field: 'volume', given: ref.volume, registry: rec.volume, score: ok ? 1 : 0, ok });
  }
  if (ref.issue && rec.issue) {
    const ok = ref.issue.toLowerCase().replace(/[^a-z0-9]/g, '') === rec.issue.toLowerCase().replace(/[^a-z0-9]/g, '');
    out.push({ field: 'issue', given: ref.issue, registry: rec.issue, score: ok ? 1 : 0, ok });
  }
  if (ref.pages && rec.pages) {
    const ok = samePages(ref.pages, rec.pages);
    out.push({ field: 'pages', given: ref.pages, registry: rec.pages, score: ok ? 1 : 0, ok });
  }
  return out;
}

/** Ranks candidates from a search. Title first, then authors, then year. */
export const rank = (c: Comparison): number => c.title + (c.firstAuthor ? 0.15 : 0) + c.authors * 0.15 - Math.min(c.yearGap ?? 0, 10) * 0.02;
