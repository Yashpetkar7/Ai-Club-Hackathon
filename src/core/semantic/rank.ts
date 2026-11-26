import { isAim, sentences, type SentenceAt } from '@/core/challenge/challenge';
import { clauses, coverage, numbers } from '@/core/claims/guards';
import { findInstructions } from '@/core/pdf/injection';

/**
 * Finding the sentence by meaning as well as by words. Everything here only puts sentences in order.
 * No score made here may decide a label or colour anything green: judge() in core/claims does that.
 */

/** Turns texts into vectors. 'query' is the student's claim or question, 'passage' is source text. */
export type Embed = (texts: string[], kind: 'query' | 'passage') => Promise<ArrayLike<number>[]>;

export interface Candidate {
  /** An exact slice of the source: text === source.slice(start, end). */
  text: string;
  start: number;
  end: number;
  /** Shared words plus a matching number, minus a statement of aim. The same score rankSentences uses, without its floor. */
  lexical: number;
  /** Share of the claim's subject words this text also has, 0 to 1. Shown as "Words shared". */
  words: number;
  /** Cosine similarity with the claim. Null when no embedder ran. Shown as "Meaning match". */
  meaning: number | null;
  /** Reciprocal rank fusion of the lexical and meaning ranks. */
  fused: number;
  /** True for two neighbouring sentences read together. */
  window: boolean;
}

export interface HybridOptions {
  /** How many candidates to return. */
  max?: number;
  /** Above this many sentences, only the closest by words are embedded. Keeps a long PDF from taking minutes. */
  maxEmbed?: number;
  /** Also try two neighbouring sentences together. By default only for a claim of more than one clause, which may join two facts. */
  windows?: boolean;
}

/** The usual constant for reciprocal rank fusion. */
export const RRF_K = 60;
/** A window has to earn its second sentence: it must add this much shared-word score to beat a single sentence. */
const WINDOW_COST = 0.1;
/** Windows are only built around the sentences closest by words or by meaning. */
const WINDOW_SEEDS = 10;

/** Cosine similarity. Zero for an empty or zero-length vector. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * Rank 1 for the highest score. Equal scores share the average of the places they fill (1, 2.5, 2.5, 4),
 * so a tie never favours position, and a crowd of weak ties does not all count as first.
 */
export function ranks(scores: number[]): number[] {
  const order = scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s);
  const out = new Array<number>(scores.length);
  for (let from = 0; from < order.length; ) {
    let to = from;
    while (to + 1 < order.length && order[to + 1]!.s === order[from]!.s) to++;
    for (let k = from; k <= to; k++) out[order[k]!.i] = (from + to) / 2 + 1;
    from = to + 1;
  }
  return out;
}

/** Reciprocal rank fusion: the sum of 1 / (k + rank) over every ranking a candidate appears in. */
export function rrf(rankLists: number[][], k = RRF_K): number[] {
  const n = rankLists[0]?.length ?? 0;
  return Array.from({ length: n }, (_, i) => rankLists.reduce((sum, list) => sum + 1 / (k + list[i]!), 0));
}

/** Single sentences, plus each pair of neighbours as one window. Every window is an exact slice of the text. */
export function sentenceWindows(text: string): (SentenceAt & { window: boolean })[] {
  const one = sentences(text).filter((s) => s.text.trim());
  const two = one.slice(1).map((s, i) => ({ text: text.slice(one[i]!.start, s.end), start: one[i]!.start, end: s.end, window: true }));
  return [...one.map((s) => ({ ...s, window: false })), ...two];
}

/** The lexical score from rankSentences, without the 0.25 floor. For finding candidates only. */
export function lexicalScore(claim: string, text: string): number {
  const want = numbers(claim);
  const n = want.length && numbers(text).some((h) => want.some((w) => w.value === h.value && w.unit === h.unit)) ? 0.15 : 0;
  return coverage(claim, text) + n - (isAim(text) ? 0.3 : 0);
}

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }): boolean => a.start < b.end && b.start < a.end;

/**
 * The closest sentences in one source. With an embedder, the word rank and the meaning rank are fused,
 * so a claim in other words still reaches the right sentence. Without one, it is the word rank alone.
 * Sentences addressed to an AI are dropped. Returned candidates never overlap each other.
 */
export async function hybridRank(claim: string, text: string, embed?: Embed, o: HybridOptions = {}): Promise<Candidate[]> {
  const max = o.max ?? 3;
  const all = sentences(text).filter((s) => s.text.trim());
  const flagged = new Set(all.flatMap((s, i) => (findInstructions(s.text).length ? [i] : [])));
  type Unit = SentenceAt & { i: number; window: boolean; lexical: number; words: number; meaning: number | null };
  const unit = (s: SentenceAt, i: number, window: boolean): Unit => ({ ...s, i, window, lexical: lexicalScore(claim, s.text) - (window ? WINDOW_COST : 0), words: coverage(claim, s.text), meaning: null });

  let singles = all.flatMap((s, i) => (flagged.has(i) ? [] : [unit(s, i, false)]));
  const cap = o.maxEmbed ?? 400;
  if (embed && singles.length > cap) singles = [...singles].sort((a, b) => b.lexical - a.lexical || a.start - b.start).slice(0, cap).sort((a, b) => a.start - b.start);

  let query: ArrayLike<number> | undefined;
  const measure = async (units: Unit[]): Promise<void> => {
    if (!embed || !units.length) return;
    query ??= (await embed([claim], 'query'))[0];
    const vectors = await embed(units.map((u) => u.text), 'passage');
    units.forEach((u, k) => {
      const v = vectors[k];
      u.meaning = query && v ? cosine(query, v) : 0;
    });
  };
  await measure(singles);

  let windows: Unit[] = [];
  if (o.windows ?? clauses(claim).length > 1) {
    const top = (score: (u: Unit) => number) => [...singles].sort((a, b) => score(b) - score(a) || a.start - b.start).slice(0, WINDOW_SEEDS).map((u) => u.i);
    const seeds = new Set([...top((u) => u.lexical), ...(embed ? top((u) => u.meaning ?? 0) : [])]);
    const firsts = new Set([...seeds].flatMap((i) => [i - 1, i]).filter((i) => i >= 0 && i + 1 < all.length && !flagged.has(i) && !flagged.has(i + 1)));
    windows = [...firsts].sort((a, b) => a - b).map((i) => unit({ text: text.slice(all[i]!.start, all[i + 1]!.end), start: all[i]!.start, end: all[i + 1]!.end }, i, true));
    await measure(windows);
  }

  // Without meaning, a candidate must share at least something with the claim. With it, meaning may find a sentence in other words.
  const pool = [...singles, ...windows].filter((u) => embed || u.lexical > 0);
  if (!pool.length) return [];
  const lists = [ranks(pool.map((u) => u.lexical))];
  if (embed) lists.push(ranks(pool.map((u) => u.meaning ?? 0)));
  const fused = rrf(lists);
  const order = pool.map((u, k) => ({ ...u, fused: fused[k]! })).sort((a, b) => b.fused - a.fused || Number(a.window) - Number(b.window) || b.lexical - a.lexical || a.start - b.start);

  const out: Candidate[] = [];
  for (const u of order) {
    if (out.length >= max) break;
    if (out.some((c) => overlaps(c, u))) continue;
    out.push({ text: u.text, start: u.start, end: u.end, lexical: u.lexical, words: u.words, meaning: u.meaning, fused: u.fused, window: u.window });
  }
  return out;
}
