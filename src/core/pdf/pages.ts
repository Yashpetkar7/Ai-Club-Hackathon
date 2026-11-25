import type { Source } from '@/core/contracts';

/** Pages of a PDF are kept apart by this in the text we store. Inside a page all spacing is single. */
export const PAGE_BREAK = '\n\n';

export interface PageAt {
  /** Page of the PDF file, counted from 1. */
  page: number;
  to?: number;
  /** Number printed on the page. Only when the file has exactly as many pages as the article. */
  printed?: number;
  printedTo?: number;
}

type Where = Pick<Source, 'text' | 'textOrigin' | 'record' | 'pdfPages'>;

/** First and last page of the article, from the registry, when both are plain numbers. */
export function articlePages(pages: string | undefined): { first: number; last: number } | null {
  const m = pages?.trim().match(/^(\d{1,6})\s*[-–—]\s*(\d{1,6})$/);
  if (!m) return null;
  const first = Number(m[1]);
  // "1488-542" is short for 1488 to 1542.
  const last = m[2]!.length < m[1]!.length ? Number(m[1]!.slice(0, m[1]!.length - m[2]!.length) + m[2]!) : Number(m[2]);
  return last >= first ? { first, last } : null;
}

/** The PDF page where a run of text sits. Null for abstracts and web text, which have no pages. */
export function pageAt(s: Where, start: number, end: number): PageAt | null {
  if (s.textOrigin !== 'pdf' || !s.text) return null;
  const breaks = (upTo: number): number => s.text!.slice(0, upTo).split(PAGE_BREAK).length;
  const page = breaks(Math.max(0, start));
  const to = breaks(Math.max(start, end - 1));
  const art = articlePages(s.record?.pages);
  const same = art && s.pdfPages === art.last - art.first + 1;
  return {
    page,
    ...(to > page ? { to } : {}),
    ...(same ? { printed: art.first + page - 1, ...(to > page ? { printedTo: art.first + to - 1 } : {}) } : {}),
  };
}

const span = (a: number, b?: number): string => (b ? `${a}–${b}` : String(a));

export const pageText = (p: Pick<PageAt, 'page' | 'to' | 'printed' | 'printedTo'>): string =>
  p.printed ? `Page ${span(p.printed, p.printedTo)} (page ${span(p.page, p.to)} of the PDF)` : `Page ${span(p.page, p.to)} of the PDF`;

/** What to type as the page of a quotation, only when we know the printed number. */
export const locatorOf = (p: PageAt | null): string => (p?.printed ? span(p.printed, p.printedTo) : '');
