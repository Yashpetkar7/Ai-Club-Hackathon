import type { Author, RegistryRecord, Source } from '@/core/contracts';
import { cleanTitle, stripTags } from '@/core/verify/normalise';
import { sentenceCase } from './sentenceCase';

export interface CslName { family?: string; given?: string; literal?: string }
export interface CslItem {
  id: string;
  type: string;
  title: string;
  author: CslName[];
  issued?: { 'date-parts': number[][] };
  'container-title'?: string;
  volume?: string;
  issue?: string;
  page?: string;
  number?: string;
  publisher?: string;
  DOI?: string;
  URL?: string;
}

const TYPE: Record<string, string> = {
  'journal-article': 'article-journal', article: 'article-journal', review: 'article-journal', journalarticle: 'article-journal',
  'proceedings-article': 'paper-conference', conferencepaper: 'paper-conference',
  book: 'book', monograph: 'book', 'edited-book': 'book', 'reference-book': 'book',
  'book-chapter': 'chapter', 'book-section': 'chapter',
  'posted-content': 'article', preprint: 'article', text: 'article',
  report: 'report', dissertation: 'thesis', dataset: 'dataset', web: 'webpage',
};

/** Organisations have no given name and stay whole. "JB" becomes "J. B." so the style prints both initials. */
const name = (a: Author): CslName => (a.given ? { family: a.family, given: a.given.replace(/^(\p{Lu})(\p{Lu})$/u, '$1. $2.') } : /\s/.test(a.family) ? { literal: a.family } : { family: a.family });

/** An article number is one long number or an e-number, never a range. */
const isArticleNumber = (p: string): boolean => /^(?:\d{5,}|[a-z]+\d{3,})$/i.test(p.trim());

export function recordToCsl(id: string, r: RegistryRecord, opts: { sentence: boolean; title?: string }): CslItem {
  const type = TYPE[r.type ?? ''] ?? (r.container ? 'article-journal' : 'document');
  const year = r.volume && r.printYear ? r.printYear : r.year;
  const article = !!r.pages && type === 'article-journal' && isArticleNumber(r.pages);
  return {
    id,
    type,
    title: opts.title ?? (opts.sentence ? sentenceCase(r.title).text : cleanTitle(r.title)),
    author: r.authors.map(name),
    ...(year ? { issued: { 'date-parts': [[year]] } } : {}),
    ...(r.container && type !== 'book' ? { 'container-title': stripTags(r.container) } : {}),
    ...(r.volume ? { volume: r.volume } : {}),
    ...(r.issue ? { issue: r.issue } : {}),
    ...(r.pages ? (article ? { number: r.pages } : { page: r.pages.replace(/\s*[-–—]\s*/g, '-') }) : {}),
    ...(r.publisher && type !== 'article-journal' ? { publisher: r.publisher } : {}),
    ...(r.doi ? { DOI: r.doi } : r.url ? { URL: r.url } : {}),
  };
}

/** Web pages and things the student typed. Built from their own words, so exports say it was kept with a reason. */
export function rawToCsl(s: Source, sentence: boolean): CslItem | null {
  const r = s.raw;
  if (!r?.title) return null;
  return {
    id: s.id,
    type: s.origin === 'web' ? 'webpage' : 'document',
    title: s.citeTitle ?? (sentence ? sentenceCase(r.title).text : r.title),
    author: (r.authors ?? []).map((a): CslName => {
      const m = a.match(/^([^,]+),\s*(.+)$/);
      return m ? { family: m[1]!.trim(), given: m[2]!.trim() } : { literal: a };
    }),
    ...(r.year ? { issued: { 'date-parts': [[r.year]] } } : {}),
    ...(r.container ? { 'container-title': r.container } : {}),
    ...(r.doi ? { DOI: r.doi } : r.url ? { URL: r.url } : {}),
  };
}

export const sourceToCsl = (s: Source, sentence: boolean): CslItem | null => (s.record ? recordToCsl(s.id, s.record, { sentence, ...(s.citeTitle ? { title: s.citeTitle } : {}) }) : rawToCsl(s, sentence));

/** Names and year used to find this source's citations in a draft. */
export function citeKey(s: Source): { family: string; year?: number; all: string[] } {
  const c = sourceToCsl(s, false);
  const all = (c?.author ?? []).map((a) => a.family ?? a.literal ?? '').filter(Boolean);
  const year = c?.issued?.['date-parts'][0]?.[0];
  return { family: all[0] ?? '', all, ...(year ? { year } : {}) };
}
