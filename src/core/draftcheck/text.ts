import { findCitations } from '@/core/cite/draft';

/** Small text tools shared by the draft checks. Pure functions, no network, no AI. */
export interface Word { t: string; start: number; end: number }
export interface Range { start: number; end: number }

const fold = (s: string): string => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '');

/** Words with their places. Hyphens split, so "well-being" and "well being" read the same. */
export function wordsOf(text: string): Word[] {
  const out: Word[] = [];
  for (const m of text.matchAll(/[\p{L}\p{N}]+(?:[’'][\p{L}]+)*/gu)) out.push({ t: fold(m[0]), start: m.index, end: m.index + m[0].length });
  return out;
}

export const STOP = new Set(
  'a an the and or but nor so yet of in on at to for from by with without against about as into over under between among across through during after before than that this these those it its they their them we our us he she his her you your i is are was were be been being am do does did has have had having can could may might must shall should will would not no also both each such some any all more most less least much many very there here when where which who whom whose what how why if then while because although though however therefore thus'.split(' '),
);
/** Words every paper uses. A run made only of these is a stock phrase, not copying. */
const STOCK = new Set(
  'study studies paper papers research researchers result results finding findings found find show shows showed shown suggest suggests suggested indicate indicates indicated evidence analysis data literature review article significant significantly relationship effect effects impact important role purpose aim examine examined investigate investigated explore explored based using used use further future present current previous'.split(' '),
);
export const content = (w: string): boolean => (w.length > 1 || /\d/.test(w)) && !STOP.has(w);
export const telling = (w: string): boolean => content(w) && !STOCK.has(w);

/** Trims common endings so "increased" and "increase" meet. Never used to decide that a claim is supported. */
export const stem = (w: string): string => (w.length < 5 ? w.replace(/s$/, '') : w.replace(/(?:ations?|ingly|edly|ings?|ies|ied|ers?|ed|es|ly|s|e)$/, ''));

/** The telling words of a passage in order, with endings trimmed. "13%", "13 percent" and "13 per cent" read the same. */
export const stemsOf = (text: string): string[] => wordsOf(text.replace(/\bper cent\b/gi, 'percent').replace(/%/g, ' percent ')).map((w) => w.t).filter(content).map(stem);

const inside = (r: Range, list: Range[]): boolean => list.some((x) => r.start < x.end && r.end > x.start);
export { inside as overlaps };

export interface Quoted extends Range { inner: string; innerStart: number; innerEnd: number }

/** Text between quotation marks. Single marks count only when they are curly or wrap a long run, because of apostrophes. */
export function quotedSpans(text: string): Quoted[] {
  const out: Quoted[] = [];
  const add = (m: RegExpMatchArray, lead: number) => {
    const at = m.index! + lead;
    out.push({ start: at, end: at + m[1]!.length + 2, inner: m[1]!, innerStart: at + 1, innerEnd: at + 1 + m[1]!.length });
  };
  for (const m of text.matchAll(/[“"]([^“”"]{3,1600})[”"]/g)) add(m, 0);
  for (const m of text.matchAll(/(?:^|[\s(\[])[‘']([^‘’'\n]{16,900})[’'](?=[\s.,;:)\]]|$)/g)) {
    const lead = m[0].search(/[‘']/);
    if (!inside({ start: m.index + lead, end: m.index + m[0].length }, out)) add(m, lead);
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Where a reference list pasted under the draft begins. Nothing after it is the student's prose. */
export function listStart(text: string): number {
  const m = text.match(/^[ \t]*(?:references|reference list|works cited|bibliography)[ \t]*:?[ \t]*$/im);
  return m ? m.index! : text.length;
}

/** Places a writing rule must leave alone: quotations, citations, addresses, and the reference list. */
export function offLimits(text: string): Range[] {
  const out: Range[] = quotedSpans(text).filter((q) => q.inner.split(/\s+/).length >= 3);
  for (const c of findCitations(text)) out.push({ start: c.start, end: c.end });
  for (const m of text.matchAll(/\b(?:https?:\/\/|www\.|doi:)\S+|\b10\.\d{4,9}\/\S+|\S+@\S+\.\S+/gi)) out.push({ start: m.index, end: m.index + m[0].length });
  const end = listStart(text);
  if (end < text.length) out.push({ start: end, end: text.length });
  return out;
}

/** The longest list of words that appear in both, in order, and which of the first list they are. */
export function inOrder(a: string[], b: string[]): number {
  let prev = new Uint16Array(b.length + 1);
  let row = new Uint16Array(b.length + 1);
  for (const x of a) {
    for (let j = 0; j < b.length; j++) row[j + 1] = x === b[j] ? prev[j]! + 1 : Math.max(prev[j + 1]!, row[j]!);
    [prev, row] = [row, prev];
  }
  return prev[b.length]!;
}

/** Paragraphs with their places. */
export function paragraphs(text: string): (Range & { text: string })[] {
  const out: (Range & { text: string })[] = [];
  for (const m of text.matchAll(/[^\n]+/g)) if (m[0].trim()) out.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  return out;
}
