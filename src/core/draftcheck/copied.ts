import { sentences } from '@/core/challenge/challenge';
import { findCitations, sourceFor, type Found } from '@/core/cite/draft';
import { titleOf } from '@/core/cite/preflight';
import { findQuote } from '@/core/claims/quote';
import type { CitationStyle, Source } from '@/core/contracts';
import { pageAt, type PageAt } from '@/core/pdf/pages';
import { inOrder, listStart, quotedSpans, stemsOf, telling, wordsOf, type Quoted, type Range, type Word } from './text';

/**
 * Copied text and quotations, compared only with the student's own library. Plain code, on this device.
 * It gives no score and no verdict. It shows two pieces of text side by side and what is missing.
 */
export type CopyKind =
  | 'copied' // the source's own words, no quotation marks
  | 'close' // most of the source's words in the source's order
  | 'quote-no-citation' // in quotation marks, no citation beside it
  | 'quote-wrong-source' // the words are in another source of the library
  | 'quote-not-there' // the cited source was read in full and does not have the words
  | 'quote-not-seen' // only the abstract of the cited source could be read
  | 'quote-unknown' // quoted, not cited, and in no source we can read
  | 'quote-no-page'; // all right, but a direct quotation needs a page

export interface CopyItem extends Range {
  kind: CopyKind;
  level: 'fix' | 'look';
  /** The student's words, exactly as in the draft. */
  text: string;
  source?: Source;
  /** The source's words. */
  passage?: string;
  page?: PageAt;
  /** True when the sentence already cites this source. */
  cited: boolean;
  words: number;
}

export interface CopyReport { items: CopyItem[]; compared: Source[]; unreadable: Source[]; quotesOk: number }

/** Eight words in a row. Shorter runs are often the only way to say something. */
const RUN = 8;
const KEY = 5;
/** A run needs this many words that are not small or stock words. */
const TELLING = 4;
const CLOSE_SHARE = 0.7;
const CLOSE_WORDS = 7;

interface SentenceIndex { start: number; end: number; stems: string[] }
interface Index { words: Word[]; at: Map<string, number[]>; sentences: SentenceIndex[]; byStem: Map<string, number[]> }
const cache = new Map<string, Index>();

function indexOf(s: Source): Index {
  const text = s.text ?? '';
  const id = `${s.id}|${text.length}|${text.slice(0, 48)}|${text.slice(-48)}`;
  const hit = cache.get(id);
  if (hit) return hit;
  const words = wordsOf(text);
  const at = new Map<string, number[]>();
  for (let i = 0; i + KEY <= words.length; i++) {
    const k = keyAt(words, i);
    const list = at.get(k);
    if (list) list.push(i);
    else at.set(k, [i]);
  }
  const ss: SentenceIndex[] = sentences(text)
    .filter((x) => x.text.length < 700)
    .map((x) => ({ start: x.start, end: x.end, stems: stemsOf(x.text) }))
    .filter((x) => x.stems.length >= 5);
  // Two neighbours rolled into one sentence are still the source's words. Single sentences come first, so they win a tie.
  for (let i = 0, n = ss.length; i + 1 < n; i++) if (ss[i]!.stems.length + ss[i + 1]!.stems.length <= 60 && ss[i + 1]!.start - ss[i]!.end < 4) ss.push({ start: ss[i]!.start, end: ss[i + 1]!.end, stems: [...ss[i]!.stems, ...ss[i + 1]!.stems] });
  const byStem = new Map<string, number[]>();
  ss.forEach((x, i) => {
    for (const w of new Set(x.stems)) {
      const list = byStem.get(w);
      if (list) list.push(i);
      else byStem.set(w, [i]);
    }
  });
  const made = { words, at, sentences: ss, byStem };
  if (cache.size > 80) cache.delete(cache.keys().next().value!);
  cache.set(id, made);
  return made;
}

function keyAt(w: Word[], i: number): string {
  let k = w[i]!.t;
  for (let j = 1; j < KEY; j++) k += ` ${w[i + j]!.t}`;
  return k;
}

interface Run { from: number; len: number; source: Source; at: number }

/** Every longest run of the draft's words that also sits in a source. */
function runsOf(words: Word[], sources: Source[]): Run[] {
  const idx = sources.map((s) => ({ s, ix: indexOf(s) }));
  const out: Run[] = [];
  let i = 0;
  while (i + KEY <= words.length) {
    const k = keyAt(words, i);
    let best: Run | null = null;
    for (const { s, ix } of idx)
      for (const p of ix.at.get(k) ?? []) {
        let n = KEY;
        while (i + n < words.length && p + n < ix.words.length && words[i + n]!.t === ix.words[p + n]!.t) n++;
        if (!best || n > best.len) best = { from: i, len: n, source: s, at: p };
      }
    if (best && best.len >= RUN && words.slice(i, i + best.len).filter((w) => telling(w.t)).length >= TELLING) {
      out.push(best);
      i += best.len;
    } else i++;
  }
  return out;
}

/** The citations that belong to a stretch of text: those in its sentence, or in the brackets straight after it. */
export function citationsFor(draft: string, r: Range, all: Found[] = findCitations(draft)): Found[] {
  const ss = sentences(draft);
  const first = ss.find((s) => s.end > r.start) ?? { start: r.start, end: r.end };
  const last = [...ss].reverse().find((s) => s.start < r.end) ?? first;
  const from = Math.min(first.start, r.start);
  let to = Math.max(last.end, r.end);
  // “… as they said.” (Bloom et al., 2015) is one thought, even with a full stop before the bracket.
  const after = draft.slice(to).match(/^["”’'\s.]*\([^()]{3,200}\)/);
  if (after) to += after[0].length;
  return all.filter((c) => c.start >= from && c.end <= to);
}

const PAGE = /\bpp?\.\s*\S|\bpara(?:graph)?s?\.?\s*\d|\bchapter\b|\bch\.\s*\d|§/i;

/** True when one of these citations names a page. MLA and Chicago print the number bare. */
function hasPage(draft: string, cites: Found[], style: CitationStyle): boolean {
  return cites.some((c) => {
    const t = draft.slice(c.start, c.end);
    if (PAGE.test(t)) return true;
    if (style === 'mla') return /\s\d{1,5}([-–]\d{1,5})?\)?$/.test(t.trim());
    if (style === 'chicago') return /\d{4}[a-z]?,\s*[a-z]?\d{1,5}/.test(t);
    return false;
  });
}

/** Cuts a quotation at "…" and at [words the student added], because those are allowed changes. */
const pieces = (q: string): string[] =>
  q
    // "[h]ome" is the same word with its capital changed.
    .replace(/\[(\p{L})\](?=\p{Ll})/gu, '$1')
    .replace(/[.,;:!?]+$/, '')
    .split(/\s*(?:…|\.\s?\.\s?\.(?:\s?\.)?|\[[^\]]*\])\s*/)
    .map((x) => x.trim().replace(/^[.,;:]+|[,;:]+$/g, ''))
    .filter((x) => x.split(/\s+/).length >= 2);

function locate(piece: string, text: string): Range | null {
  const flip = (f: (c: string) => string) => f(piece[0]!) + piece.slice(1);
  return findQuote(piece, text) ?? findQuote(flip((c) => c.toLowerCase()), text) ?? findQuote(flip((c) => c.toUpperCase()), text);
}

/** Where a quotation sits in a source, or null. Every piece must be there, word for word. */
export function quoteIn(quote: string, text: string): Range | null {
  const parts = pieces(quote);
  if (!parts.length) return null;
  const found = parts.map((p) => locate(p, text));
  if (found.some((f) => !f)) return null;
  return { start: Math.min(...found.map((f) => f!.start)), end: Math.max(...found.map((f) => f!.end)) };
}

const sentenceOf = (text: string, at: number): string => sentences(text).find((s) => s.start <= at && s.end > at)?.text ?? text.slice(at, at + 200);

export function checkCopied(draft: string, library: Source[], style: CitationStyle = 'apa'): CopyReport {
  const compared = library.filter((s) => s.text?.trim());
  const unreadable = library.filter((s) => !s.text?.trim());
  const end = listStart(draft);
  const body = draft.slice(0, end);
  const all = findCitations(body);
  const items: CopyItem[] = [];
  const quotes = quotedSpans(body).filter((q) => wordsOf(q.inner).length >= 4);
  let quotesOk = 0;

  for (const q of quotes) {
    const r = { start: q.start, end: q.end };
    const n = wordsOf(q.inner).length;
    const cites = citationsFor(body, r, all);
    const cited = cites.map((c) => sourceFor(c, library)).filter((s): s is Source => !!s);
    const base = { ...r, text: body.slice(r.start, r.end), words: n };
    const within = (list: Source[]) => {
      for (const s of list) {
        const at = s.text ? quoteIn(q.inner, s.text) : null;
        if (at) return { s, at };
      }
      return null;
    };
    const hit = within(cited);
    if (hit) {
      const page = pageAt(hit.s, hit.at.start, hit.at.end);
      if (style === 'ieee' || hasPage(body, cites, style)) quotesOk++;
      else items.push({ ...base, kind: 'quote-no-page', level: 'look', source: hit.s, passage: hit.s.text!.slice(hit.at.start, hit.at.end), cited: true, ...(page ? { page } : {}) });
      continue;
    }
    const other = within(compared.filter((s) => !cited.includes(s)));
    if (other) {
      const page = pageAt(other.s, other.at.start, other.at.end);
      items.push({ ...base, kind: cites.length ? 'quote-wrong-source' : 'quote-no-citation', level: 'fix', source: other.s, passage: other.s.text!.slice(other.at.start, other.at.end), cited: false, ...(page ? { page } : {}) });
      continue;
    }
    const readable = cited.filter((s) => s.text);
    if (readable.length) {
      const full = readable.every((s) => s.textOrigin === 'pdf' || s.textOrigin === 'fulltext');
      items.push({ ...base, kind: full ? 'quote-not-there' : 'quote-not-seen', level: full ? 'fix' : 'look', source: readable[0]!, cited: true });
    } else if (!cites.length && n >= 6) items.push({ ...base, kind: 'quote-unknown', level: 'look', cited: false });
  }

  const inQuote = (r: Range): Quoted | undefined => quotes.find((q) => r.start >= q.start - 1 && r.end <= q.end + 1);
  // A title the student mentions is not copying. Titles sit inside PDFs, so they would match.
  const titles = library.map((s) => ` ${wordsOf(titleOf(s)).map((w) => w.t).join(' ')} `);
  const words = wordsOf(body);
  const copied: Range[] = [];
  for (const run of runsOf(words, compared)) {
    const a = words[run.from]!;
    const z = words[run.from + run.len - 1]!;
    let r = { start: a.start, end: z.end };
    if (inQuote(r)) continue;
    const said = ` ${words.slice(run.from, run.from + run.len).map((w) => w.t).join(' ')} `;
    if (titles.some((t) => t.includes(said))) continue;
    // Part of the run may be quoted. Only what lies outside the marks is unmarked.
    const part = quotes.find((q) => r.start < q.end && r.end > q.start);
    if (part) {
      const left = { start: r.start, end: Math.min(r.end, part.start) };
      const right = { start: Math.max(r.start, part.end), end: r.end };
      const keep = [left, right].find((x) => x.end > x.start && wordsOf(body.slice(x.start, x.end)).length >= RUN);
      if (!keep) continue;
      r = keep;
    }
    const ix = indexOf(run.source);
    const from = ix.words[run.at]!.start;
    const to = ix.words[run.at + run.len - 1]!.end;
    const page = pageAt(run.source, from, to);
    const cited = citationsFor(body, r, all).some((c) => sourceFor(c, [run.source]));
    copied.push(r);
    items.push({ ...r, kind: 'copied', level: 'fix', text: body.slice(r.start, r.end), source: run.source, passage: sentenceOf(run.source.text!, from), cited, words: run.len, ...(page ? { page } : {}) });
  }

  for (const s of sentences(body)) {
    if (copied.some((c) => c.start < s.end && c.end > s.start)) continue;
    const cites = all.filter((c) => c.start >= s.start && c.end <= s.end);
    // What is quoted or cited is already marked as someone else's. Only the rest is compared.
    let bare = s.text;
    for (const c of [...cites, ...quotes].sort((a, b) => b.start - a.start)) {
      const from = Math.max(0, c.start - s.start);
      const to = Math.min(bare.length, c.end - s.start);
      if (to > from) bare = `${bare.slice(0, from)} ${' '.repeat(Math.max(0, to - from - 1))}${bare.slice(to)}`;
    }
    const mine = stemsOf(bare);
    if (mine.length < CLOSE_WORDS) continue;
    const unlike = new Set(mine).size;
    let best: { src: Source; at: SentenceIndex; n: number } | null = null;
    for (const src of compared) {
      const ix = indexOf(src);
      const seen = new Map<number, number>();
      for (const w of new Set(mine)) for (const k of ix.byStem.get(w) ?? []) seen.set(k, (seen.get(k) ?? 0) + 1);
      for (const [k, n] of seen) {
        if (n < unlike * 0.6) continue;
        const got = inOrder(mine, ix.sentences[k]!.stems);
        if (!best || got > best.n) best = { src, at: ix.sentences[k]!, n: got };
      }
    }
    if (!best || best.n < CLOSE_WORDS || best.n / mine.length < CLOSE_SHARE) continue;
    const page = pageAt(best.src, best.at.start, best.at.end);
    items.push({
      start: s.start,
      end: s.end,
      kind: 'close',
      level: 'look',
      text: s.text,
      source: best.src,
      passage: best.src.text!.slice(best.at.start, best.at.end),
      cited: cites.some((c) => sourceFor(c, [best!.src])),
      words: best.n,
      ...(page ? { page } : {}),
    });
  }
  return { items: items.sort((a, b) => a.start - b.start), compared, unreadable, quotesOk };
}

/** One plain line for each kind. */
export function copyText(i: CopyItem): { title: string; why: string } {
  switch (i.kind) {
    case 'copied':
      return i.cited
        ? { title: 'The source’s own words, without quotation marks', why: `${i.words} words in a row match. You cite the source, but readers cannot see that the words are theirs.` }
        : { title: 'The source’s own words, with no quotation marks and no citation', why: `${i.words} words in a row match.` };
    case 'close':
      return { title: 'Very close to the source’s wording', why: i.cited ? 'You cite it, but most words are the source’s, in the source’s order. Close the source and say it again from memory.' : 'Most words are the source’s, in the source’s order, and there is no citation.' };
    case 'quote-no-citation':
      return { title: 'A quotation with no citation', why: 'We found these words in your library. The citation is missing.' };
    case 'quote-wrong-source':
      return { title: 'These words are in another source', why: 'They are not in the source you cite here. They are in this one.' };
    case 'quote-not-there':
      return { title: 'These words are not in the source you cite', why: 'We read the PDF you added, and this exact wording is not in it.' };
    case 'quote-not-seen':
      return { title: 'We could not see these words', why: 'We can read only the abstract of the source you cite, and the words are not there. Add its PDF to check.' };
    case 'quote-unknown':
      return { title: 'A quotation from no source we can read', why: 'There is no citation beside it, and no source in your library has these words.' };
    case 'quote-no-page':
      return { title: 'A direct quotation needs a page', why: i.page ? 'The words match the source. Add the page.' : 'The words match the source. We can read only text without pages, so look the page up.' };
  }
}
