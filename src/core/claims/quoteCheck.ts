import type { Source } from '@/core/contracts';
import { quotesExactly } from './quote';

/**
 * Checks a quotation the student asks about against the text we hold for their sources. Plain code, no AI.
 * Only the exact words, found in a source's text, may ever look positive. Everything else says what could not
 * be checked and why: we never confirm a quotation we did not find.
 */
export type QuoteCheck =
  | { kind: 'found'; quote: string; source: Source }
  | { kind: 'not-in-text'; quote: string; checked: Source[] }
  | { kind: 'abstract-only'; quote: string; checked: Source[] }
  | { kind: 'no-source'; quote: string; cited: string };

const flat = (s: string): string =>
  s
    .normalize('NFKC')
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'%-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The quotation in a question: words inside straight or curly double quotes, at least four of them. */
export function quoteIn(question: string): string | null {
  const m = question.match(/["“”]([^"“”]{8,600})["“”]/);
  const q = m?.[1]?.trim();
  return q && q.split(/\s+/).length >= 4 ? q : null;
}

/** The citation after the quotation, such as (LeCun, Bengio & Hinton, 2015): family names and a year, if given. */
export function citedIn(question: string): { names: string[]; year?: number; text: string } | null {
  const m = question.match(/\(([^()]*\b(1[89]\d\d|20\d\d)[a-z]?)\)\s*$/) ?? question.match(/\(([^()]{2,120})\)/);
  if (!m) return null;
  const text = m[1]!.trim();
  const year = text.match(/\b(1[89]\d\d|20\d\d)\b/)?.[1];
  const names = (text.match(/\p{Lu}[\p{L}'-]+/gu) ?? []).filter((n) => !/^(And|Et|Al|In|Press)$/i.test(n));
  return { names, ...(year ? { year: Number(year) } : {}), text };
}

const familiesOf = (s: Source): string[] => (s.record?.authors.map((a) => a.family) ?? s.raw?.authors ?? []).map((n) => flat(n));
const yearOf = (s: Source): number | undefined => s.record?.year ?? s.raw?.year;

export function checkQuote(question: string, sources: Source[]): QuoteCheck | null {
  const quote = quoteIn(question);
  if (!quote) return null;
  const cited = citedIn(question.slice(question.indexOf(quote) + quote.length));
  // With a citation, only the cited work counts: words found in some other paper do not confirm this one.
  const pool = cited?.names.length
    ? sources.filter((s) => {
        const fam = familiesOf(s);
        const named = cited.names.some((n) => fam.includes(flat(n)));
        return named && (!cited.year || yearOf(s) === cited.year);
      })
    : sources;
  if (!pool.length) return { kind: 'no-source', quote, cited: cited?.text ?? 'the cited source' };
  // The same exactness as everywhere else (quote.ts): only spacing, quote marks, dashes and the first capital may differ.
  const hit = pool.find((s) => s.text && quotesExactly(quote, s.text));
  if (hit) return { kind: 'found', quote, source: hit };
  const withText = pool.filter((s) => s.text);
  if (!withText.length) return { kind: 'no-source', quote, cited: cited?.text ?? 'the cited source' };
  // Only a full text can show the words are missing from the paper. An abstract cannot.
  return withText.some((s) => s.textOrigin && s.textOrigin !== 'abstract') ? { kind: 'not-in-text', quote, checked: withText } : { kind: 'abstract-only', quote, checked: withText };
}
