import { clauses, coverage, directionWords, numbers, scopeWords, type Num } from './guards';

/**
 * What the claim says next to what the sentence says, for each check, with the parts that differ marked.
 * For showing the student only. The label comes from judge(); nothing here can change it.
 */
export interface Bit { text: string; differs: boolean }
export interface Sides { you: Bit[]; source: Bit[] }

const add = (list: Bit[], b: Bit): void => {
  if (!list.some((x) => x.text === b.text)) list.push(b);
};
const clauseOf = (s: string, at: number): string => clauses(s).find((c) => at >= c.start && at < c.start + c.text.length)?.text ?? s;

/** The clauses of the sentence most about the claim, or the whole sentence when none is. */
function closest(claim: string, sentence: string): string {
  const cl = clauses(sentence).map((c) => ({ t: c.text, n: coverage(claim, c.text) }));
  const top = Math.max(0, ...cl.map((c) => c.n));
  return top ? cl.filter((c) => c.n === top).map((c) => c.t).join(' ') : sentence;
}

/** "You: 31% · Source: 13%". A number the sentence does not have is marked, with the sentence's numbers of the same kind about the same thing. */
export function numberSides(claim: string, sentence: string): Sides | null {
  const want = numbers(claim);
  if (!want.length) return null;
  const have = numbers(sentence);
  const out: Sides = { you: [], source: [] };
  const near = (n: Num, h: Num) => coverage(clauseOf(claim, n.at), clauseOf(sentence, h.at));
  for (const n of want) {
    const same = have.find((h) => h.value === n.value && h.unit === n.unit);
    if (same) {
      add(out.you, { text: n.text, differs: false });
      add(out.source, { text: same.text, differs: false });
      continue;
    }
    add(out.you, { text: n.text, differs: true });
    const rivals = have.filter((h) => h.unit === n.unit);
    const best = Math.max(0, ...rivals.map((h) => near(n, h)));
    for (const h of rivals.filter((x) => near(n, x) === best)) add(out.source, { text: h.text, differs: true });
  }
  return out;
}

/** "You: increase · Source: fell". Up against down is marked, and so is a "not" on one side only. */
export function directionSides(claim: string, sentence: string): Sides | null {
  const mine = directionWords(claim);
  const theirs = directionWords(closest(claim, sentence));
  if (!mine.length && !theirs.length) return null;
  const ways = (l: typeof mine) => new Set(l.filter((w) => w.dir !== 'not').map((w) => w.dir));
  const nots = (l: typeof mine) => l.filter((w) => w.dir === 'not').length % 2;
  const mark = (l: typeof mine, other: typeof mine): Bit[] => {
    const o = ways(other);
    const notDiffers = nots(l) !== nots(other);
    const out: Bit[] = [];
    for (const w of l) add(out, { text: w.word, differs: w.dir === 'not' ? notDiffers : o.size > 0 && !o.has(w.dir) });
    return out;
  };
  return { you: mark(mine, theirs), source: mark(theirs, mine) };
}

/** "You: causes · Source: associated, may". A word of certainty, cause or hedging on one side only is marked. */
export function scopeSides(claim: string, sentence: string): Sides | null {
  const mine = scopeWords(claim);
  const theirs = scopeWords(sentence);
  if (!mine.length && !theirs.length) return null;
  return { you: mine.map((w) => ({ text: w, differs: !theirs.includes(w) })), source: theirs.map((w) => ({ text: w, differs: !mine.includes(w) })) };
}
