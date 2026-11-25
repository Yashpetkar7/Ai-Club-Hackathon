import { tokens } from '@/core/verify/normalise';

/**
 * Plain-code checks on a claim against one sentence. Each answers:
 *   ok        the sentence says the same thing on this point
 *   conflict  the sentence says something else on this point
 *   missing   the sentence does not cover this point
 *   none      the claim has nothing to check here
 * They only ever take a Verified away. None of them can grant one alone.
 */
export type Guard = 'ok' | 'conflict' | 'missing' | 'none';

const STOP = new Set('a an the and or of in on at to for from by with that this these those is are was were be been being it its their they we our as than also can may might will would should could does do did has have had not no between among across into over under about how what which who when where while if then such both each most some any all very much many more less just only per during after before because due there here them his her he she you your i found find finds shows show showed shown results result study studies paper research report reported reports evidence suggests suggest indicate indicates author authors researcher researchers participant participants'.split(' '));

const UP = new Set('increase increases increased increasing improve improves improved improving improvement raise raises raised raising rise rises rose rising higher greater boost boosts boosted enhance enhances enhanced gain gains grew grow grows growth lifted strengthened better more up doubled doubling temporarily_rose positive positively'.split(' '));
const DOWN = new Set('decrease decreases decreased decreasing reduce reduces reduced reducing reduction lower lowers lowered fall falls fell falling worse worsen worsens worsened harm harms harmed hinder hinders decline declines declined drop drops dropped fewer less down halved halving cut cuts shrank shrink shrinks negative negatively impair impairs impaired'.split(' '));
const NEG = new Set('no not never none neither nor non without cannot cant dont doesnt didnt isnt arent wasnt werent wont hardly rarely failed fails lack lacks lacked unlikely'.split(' '));

const stem = (w: string): string => {
  const s = w.replace(/ies$/, 'y').replace(/(?:ations?|ings?|ed|es|s)$/, '');
  return s.length >= 3 ? s : w;
};
/** Small groups of words a claim and its source use for each other. Kept short: each one is a risk. */
const GROUPS = [
  ['home', 'wfh', 'remote', 'remotely', 'telework', 'homeworking'],
  ['worker', 'employee', 'staff'],
  ['time', 'minute', 'hour', 'duration'],
  ['quality', 'qualit'],
  ['reference', 'citation', 'bibliographic'],
  ['fabricat', 'fabricated', 'invented', 'nonexistent'],
  ['attrition', 'turnover', 'quit', 'resign'],
  ['performance', 'productivity', 'productiv'],
  ['promotion', 'promot', 'promoted'],
].map((g) => new Set(g.flatMap((w) => [w, stem(w)])));
const like = (a: string, b: string): boolean => a === b || stem(a) === stem(b) || GROUPS.some((g) => (g.has(a) || g.has(stem(a))) && (g.has(b) || g.has(stem(b))));

/** Words that say what a statement is about. */
export const subjectWords = (s: string): string[] => [...new Set(tokens(s.replace(/-/g, ' ')).filter((w) => w.length > 2 && !STOP.has(w) && !UP.has(w) && !DOWN.has(w) && !NEG.has(w) && !/^\d/.test(w) && !NUMBER_WORDS.has(w) && !['percent', 'cent', 'half', 'third', 'quarter'].includes(w)))];

const UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const NUMBER_WORDS = new Map<string, number>([...UNITS.map((w, i) => [w, i] as const).filter(([w]) => w !== 'one'), ...TENS.map((w, i) => [w, i * 10] as const).filter(([w]) => w)]);

export interface Num { value: number; unit: '%' | 'x' | ''; at: number; text: string }

/** Numbers with their unit. Names such as GPT-4, COVID-19 and years in brackets are not quantities. */
export function numbers(raw: string): Num[] {
  const s = raw.replace(/\bper cent\b/gi, 'percent ');
  const out: Num[] = [];
  const re = /(?<![\p{L}\p{N}.,-])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(%|percent\b|per cent\b|percentage points?\b|times\b|fold\b|-fold\b|x\b))?(?![\p{N}])/giu;
  for (const m of s.matchAll(re)) {
    const after = s.slice(m.index + m[0].length, m.index + m[0].length + 1);
    if (!m[2] && /[\p{L}]/u.test(after)) continue;
    const u = (m[2] ?? '').toLowerCase();
    const value = Number(m[1]!.replace(/,/g, ''));
    const before = s[m.index - 1];
    if (!u && /^(1[89]|20)\d{2}$/.test(m[1]!) && (before === '(' || /\b(in|since|from|until|by|of)\s$/i.test(s.slice(0, m.index)))) continue;
    out.push({ value, unit: /^(%|per)/.test(u) ? '%' : u ? 'x' : '', at: m.index, text: m[0] });
  }
  const w = /\b([a-z]+)(?:[\s-]([a-z]+))?\s*(%|percent|per cent|percentage points?|times|fold)?/gi;
  for (const m of s.matchAll(w)) {
    const a = NUMBER_WORDS.get(m[1]!.toLowerCase());
    if (a === undefined) continue;
    const b = NUMBER_WORDS.get((m[2] ?? '').toLowerCase());
    const unitText = (m[3] ?? (/^(percent|times|fold)$/i.test(m[2] ?? '') ? m[2]! : '')).toLowerCase();
    const value = a >= 20 && b !== undefined && b < 10 ? a + b : a;
    out.push({ value, unit: /^per/.test(unitText) ? '%' : unitText ? 'x' : '', at: m.index, text: m[0].trim() });
  }
  for (const m of s.matchAll(/\b(half|halved|halving|doubled|doubling|double|tripled|twice)\b/gi)) {
    const t = m[1]!.toLowerCase();
    out.push(/^hal/.test(t) ? { value: 50, unit: '%', at: m.index, text: m[0] } : { value: /^tr/.test(t) ? 3 : 2, unit: 'x', at: m.index, text: m[0] });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Cuts a sentence where it changes what it is talking about. */
export function clauses(s: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  const re = /(?:;|:(?=\s)|,(?=\s)|\s+(?:and|but|while|whereas|although|though|however|yet)\s+)/gi;
  let last = 0;
  for (const m of s.matchAll(re)) {
    out.push({ text: s.slice(last, m.index), start: last });
    last = m.index + m[0].length;
  }
  out.push({ text: s.slice(last), start: last });
  return out.filter((c) => c.text.trim());
}

/** Letters-and-digits names such as GPT-4, plus acronyms and mid-sentence capitals. */
export function names(s: string): string[] {
  const out = new Set<string>();
  for (const m of s.matchAll(/[\p{L}\p{N}][\p{L}\p{N}.\-]*/gu)) {
    const w = m[0].replace(/[.\-]+$/, '');
    const first = m.index === 0 || /[.!?]\s+$/.test(s.slice(0, m.index));
    const named = (/\p{L}/u.test(w) && /\d/.test(w)) || /^\p{Lu}{2,}$/u.test(w) || /\p{Ll}\p{Lu}/u.test(w) || (/^\p{Lu}\p{Ll}{2,}/u.test(w) && !first);
    if (named) out.add(w.toLowerCase().replace(/^chatgpt-/, 'gpt-'));
  }
  return [...out];
}

const overlap = (a: string[], b: string[]): number => a.filter((x) => b.some((y) => like(x, y))).length;

/**
 * A number must match and belong to the same thing. "Cut the time by 18%" fails when the source
 * says time fell 40% and quality rose 18%.
 */
export function numbersGuard(claim: string, sentence: string): Guard {
  const want = numbers(claim);
  if (!want.length) return 'none';
  const have = numbers(sentence);
  if (!have.length) return 'missing';
  const cClauses = clauses(claim);
  const sClauses = clauses(sentence);
  const inClause = (cl: { text: string; start: number }[], n: Num) => cl.find((c) => n.at >= c.start && n.at < c.start + c.text.length)?.text ?? '';
  let worst: Guard = 'ok';
  for (const n of want) {
    const same = have.filter((h) => h.value === n.value && h.unit === n.unit);
    if (!same.length) {
      // Another number of the same kind for the same subject is a conflict. Otherwise the point is not covered.
      if (have.some((h) => h.unit === n.unit)) return 'conflict';
      worst = 'missing';
      continue;
    }
    const mine = subjectWords(inClause(cClauses, n));
    const myNames = names(inClause(cClauses, n));
    const scoreOf = (text: string) => overlap(mine, subjectWords(text));
    const homes = same.map((h) => inClause(sClauses, h));
    const best = Math.max(...homes.map(scoreOf));
    const elsewhere = Math.max(0, ...sClauses.filter((c) => !homes.includes(c.text)).map((c) => scoreOf(c.text)));
    const nameClash = myNames.length > 0 && homes.every((h) => {
      const there = names(h);
      return there.length > 0 && !myNames.some((x) => there.includes(x));
    });
    if (nameClash) return 'conflict';
    // Two numbers of the same kind: the subject has to point at this one.
    const rivals = have.filter((h) => h.unit === n.unit && h.value !== n.value);
    if (rivals.length) {
      // "55% of A but just 18% of B are fabricated": the ending belongs to both halves. Only this shape is let through.
      const share = /^\s*(?:likewise\s*)?(?:just |only |about |nearly |almost |over )*\d[\d.]*\s*(?:%|percent) of\b/i;
      const shared = homes.every((h) => share.test(h)) && sClauses.filter((c) => !homes.includes(c.text) && numbers(c.text).some((h) => h.unit === n.unit)).every((c) => share.test(c.text));
      if (best === 0 && elsewhere > 0) return 'conflict';
      if (best === 0) worst = 'missing';
      else if (!shared && elsewhere > best && sClauses.some((c) => !homes.includes(c.text) && scoreOf(c.text) === elsewhere && numbers(c.text).some((h) => h.unit === n.unit))) return 'conflict';
      const distinct = mine.filter((w) => !homes.some((h) => subjectWords(h).some((x) => like(w, x))));
      const taken = !shared && distinct.some((w) => sClauses.some((c) => !homes.includes(c.text) && numbers(c.text).some((h) => h.unit === n.unit) && subjectWords(c.text).some((x) => like(w, x))));
      if (taken) return 'conflict';
    }
    // "43% of the real citations" is not "43% of the citations": the narrower group has to be named.
    for (const h of homes) {
      const group = h.slice(Math.max(0, h.search(/\d/))).match(/^\d[\d.]*\s*(?:%|percent) of (?:the |all |these )?([^,;.]{3,60})/i)?.[1];
      if (group && subjectWords(group.split(/\s+/).slice(0, 5).join(' ')).some((w) => !subjectWords(claim).some((x) => like(w, x)))) worst = 'missing';
    }
  }
  return worst;
}

type Dir = 'up' | 'down' | 'flat' | null;

/** Which way one clause points. A negation just before turns it into "no change". */
function dirOf(text: string): Dir {
  const t = tokens(text.replace(/-/g, ' '));
  let d: Dir = null;
  for (let i = 0; i < t.length; i++) {
    const w = t[i]!;
    let here: Dir = UP.has(w) ? 'up' : DOWN.has(w) ? 'down' : null;
    if (w === 'more' || w === 'less' || w === 'up' || w === 'down' || w === 'better' || w === 'worse' || w === 'positive' || w === 'negative') {
      if ((w === 'more' || w === 'less') && t[i + 1] === 'than') here = null;
    }
    if (!here) continue;
    if (t.slice(Math.max(0, i - 4), i).some((x) => NEG.has(x))) here = 'flat';
    d = d === null || d === here ? here : 'flat';
  }
  if (d === null && /\bno (significant |measurable |clear )?(effect|difference|impact|change|relationship|association|evidence)\b/i.test(text)) return 'flat';
  return d;
}

/** Compares rose/fell, more/fewer for the part of the sentence that is about the claim's subject. */
export function directionGuard(claim: string, sentence: string): Guard {
  const want = dirOf(claim);
  if (want === null) return 'none';
  const mine = subjectWords(claim);
  const nums = numbers(claim);
  const cl = clauses(sentence).map((c) => ({ ...c, dir: dirOf(c.text), score: overlap(mine, subjectWords(c.text)) + (nums.length && numbers(c.text).some((h) => nums.some((n) => n.value === h.value && n.unit === h.unit)) ? 2 : 0) }));
  const withDir = cl.filter((c) => c.dir !== null);
  if (!withDir.length) return 'missing';
  const top = Math.max(...withDir.map((c) => c.score));
  if (top === 0) return 'missing';
  const best = withDir.filter((c) => c.score === top);
  if (best.every((c) => c.dir === want)) return 'ok';
  // Equal evidence both ways is not a match, and a clear opposite is a conflict.
  return best.some((c) => c.dir === want) ? 'missing' : 'conflict';
}

/** "Not" in one and not in the other, close to the same subject. */
export function negationGuard(claim: string, sentence: string): Guard {
  // Counted, so "lack of X is not linked" differs from "lack of X is linked".
  const count = (s: string) => tokens(s.replace(/\bnot only\b/gi, '').replace(/-/g, ' ')).filter((w) => NEG.has(w)).length;
  const has = (s: string) => count(s) % 2 === 1;
  const c = has(claim);
  if (!count(claim) && !count(sentence)) return 'none';
  const mine = subjectWords(claim);
  const cl = clauses(sentence).map((x) => ({ neg: has(x.text), score: overlap(mine, subjectWords(x.text)) }));
  const top = Math.max(...cl.map((x) => x.score));
  const near = cl.filter((x) => x.score === top && top > 0);
  if (!near.length) return 'missing';
  if (near.every((x) => x.neg === c)) return c ? 'ok' : 'none';
  return near.some((x) => x.neg === c) ? 'missing' : 'conflict';
}

const ABSOLUTE = /\b(all|always|every|everyone|everybody|never|none|entirely|completely|any|only|must|every single|without exception|universally)\b/gi;
const PROOF = /\b(proves?|proved|proven|guarantees?|guaranteed|undeniabl[ey]|definitely|certainly|conclusively)\b/gi;
const CAUSE = /\b(causes?|caused|causing|because of|leads? to|led to|results? in|resulted in|makes?|made|drives?|drove|due to|effects? of|impact of)\b/i;
const LINK = /\b(associat\w+|correlat\w+|linked|related|relationship|predict\w*)\b/i;
const HEDGE = /\b(may|might|could|can|suggests?|suggested|possibl[ey]|perhaps|likely|appears?|appeared|seems?|seemed|tends?|often|some|sometimes|partly|preliminary|hypothes\w+|temporarily|conditional|self-reported|reported)\b/gi;
const MOST = /\b(most|majority|usually|generally|typically|mainly|mostly)\b/i;
/** The sentence reports what someone else thinks, asks a question or sets a condition. */
const FRAME = /\b(whether|if|critics|argue[sd]?|claim(s|ed)? that|believe[sd]?|assume[sd]?|it is (often )?(said|thought|assumed)|concerns? (that|this)|hypothesi[sz]ed?|hypothesis that|expect(ed|s)?|myth|not the case|aims? to|examin\w+ whether)\b/i;

const bestClauses = (claim: string, sentence: string): string[] => {
  const mine = subjectWords(claim);
  const cl = clauses(sentence).map((c) => ({ t: c.text, n: overlap(mine, subjectWords(c.text)) }));
  const top = Math.max(...cl.map((c) => c.n));
  return top ? cl.filter((c) => c.n === top).map((c) => c.t) : [];
};

const set = (s: string, re: RegExp): Set<string> => new Set([...s.matchAll(new RegExp(re.source, 'gi'))].map((m) => m[0].toLowerCase()));

const OPPOSITES: [RegExp, RegExp][] = [
  [/\b(close|near|nearly)\b/i, /\bfar from\b/i],
  [/\b(similar|same|equal|alike|identical)\b/i, /\b(different|unequal|dissimilar)\b/i],
  [/\b(strong|strongly)\b/i, /\b(weak|weakly)\b/i],
  [/\b(large|big|substantial|substantially)\b/i, /\b(small|minor|slight|slightly|negligible)\b/i],
  [/\b(easy|easily)\b/i, /\b(difficult|hard|hardly)\b/i],
  [/\b(success|succeeded|successful)\b/i, /\b(failure|unsuccessful)\b/i],
  [/\bmajor\b/i, /\bminor\b/i],
  [/\b(support|supports|supported)\b/i, /\b(reject|rejects|rejected|refute|refutes|refuted|disconfirm|contradict|contradicts)\b/i],
  [/\b(same|equal|equally|similar)\b/i, /\b(more|less|fewer|faster|slower|higher|lower|greater|\w+er) than\b/i],
];
/** Two sides a sentence may contrast. What is said of one must not be moved to the other. */
const SIDES: [string[], string[]][] = [
  [['true', 'truth', 'real', 'genuine'], ['false', 'falsehood', 'fabricated', 'fake', 'invented']],
  [['men', 'male', 'males', 'boys'], ['women', 'female', 'females', 'girls']],
  [['original'], ['replication', 'replications']],
  [['treatment', 'treated', 'experimental', 'exposed'], ['control', 'untreated', 'unexposed']],
  [['young', 'younger'], ['old', 'older']],
  [['rich', 'richer', 'wealthy'], ['poor', 'poorer']],
  [['public'], ['private']],
  [['urban'], ['rural']],
  [['before'], ['after']],
  [['home', 'remote'], ['office']],
];

/** "A more than B" is not "B more than A", and what is said of one side is not said of the other. */
function sidesSwapped(claim: string, sentence: string): boolean {
  const parts = (s: string): [string[], string[]][] => [...s.matchAll(/\bthan\b/gi)].map((m) => {
    const left = s.slice(0, m.index).split(/(?:;|, and the |, but |\bthat\b)/).at(-1)!;
    return [subjectWords(left), subjectWords(s.slice(m.index + 4).split(/(?:;|, and |, but )/)[0]!)];
  });
  const [mine] = parts(claim);
  if (mine) {
    const only = (a: string[], b: string[]) => a.filter((w) => !b.some((x) => like(w, x)));
    const L = only(mine[0], mine[1]);
    const Rr = only(mine[1], mine[0]);
    for (const [sl, sr] of parts(sentence)) if (overlap(L, only(sr, sl)) && overlap(Rr, only(sl, sr))) return true;
  }
  const c = tokens(claim.replace(/-/g, ' '));
  const t = tokens(sentence.replace(/-/g, ' '));
  for (const pair of SIDES) {
    const mineIs = pair.findIndex((p, i) => c.some((w) => p.includes(w)) && !c.some((w) => pair[1 - i]!.includes(w)));
    if (mineIs < 0 || !pair.every((p) => t.some((w) => p.includes(w)))) continue;
    const own = pair[mineIs]!;
    const others = subjectWords(claim).filter((w) => !own.includes(w));
    const under = (i: number): number => {
      for (let k = i; k >= 0; k--) {
        const side = pair.findIndex((p) => p.includes(t[k]!));
        if (side >= 0) return side;
      }
      return -1;
    };
    let mineHits = 0;
    let otherHits = 0;
    for (const w of others) {
      const at = t.flatMap((x, i) => (like(x, w) ? [under(i)] : []));
      if (!at.length || at.includes(-1)) continue;
      if (at.includes(mineIs)) mineHits++;
      else otherHits++;
    }
    if (otherHits > mineHits) return true;
  }
  return false;
}

/** The claim may not be stronger, wider or more certain than the sentence. */
export function scopeGuard(claim: string, sentence: string): Guard {
  const extra = (re: RegExp): boolean => [...set(claim, re)].some((w) => !set(sentence, re).has(w));
  if (extra(ABSOLUTE) || extra(PROOF)) return 'conflict';
  if (MOST.test(claim) && !MOST.test(sentence)) return 'conflict';
  if (CAUSE.test(claim) && LINK.test(sentence) && !CAUSE.test(sentence)) return 'conflict';
  const wide = sentence.split(/[;,]\s|\bbut\b/).map((t) => ({ t, n: overlap(subjectWords(claim), subjectWords(t)) }));
  const best = wide.filter((x) => x.n === Math.max(...wide.map((y) => y.n))).map((x) => x.t).join(' ');
  for (const [a, b] of OPPOSITES) for (const [x, y] of [[a, b], [b, a]] as const) if (x.test(claim) && !y.test(claim) && y.test(best) && !x.test(best)) return 'conflict';
  if (sidesSwapped(claim, sentence)) return 'conflict';
  // Dropping "may" or "suggests" turns a possibility into a fact.
  const hedges = set(sentence, HEDGE);
  if (hedges.size && ![...set(claim, HEDGE)].length && bestClauses(claim, sentence).some((c) => set(c, HEDGE).size)) return 'conflict';
  // "A is better than B" is not "B is better than A".
  const there = names(sentence);
  const both = names(claim).filter((n) => there.includes(n));
  if (both.length > 1 && /\b(over|than|compared|versus|vs|above|below|ahead|behind|beats?|outperform\w*)\b/i.test(claim)) {
    const order = (s: string) => [...both].sort((a, b) => s.toLowerCase().indexOf(a) - s.toLowerCase().indexOf(b)).join();
    if (order(claim) !== order(sentence)) return 'conflict';
  }
  // What the claim is about, its first real word, has to be in the sentence.
  const lead = subjectWords(claim)[0];
  if (lead && !subjectWords(sentence).some((w) => like(w, lead))) return 'missing';
  const missing = names(claim).filter((n) => !there.includes(n) && !sentence.toLowerCase().includes(n));
  if (missing.length) return 'missing';
  return 'ok';
}

/** True when the sentence only raises the idea, so quoting part of it would twist it. */
export const framed = (sentence: string): boolean => FRAME.test(sentence);

export interface Guards { numbers: Guard; direction: Guard; negation: Guard; scope: Guard; framed: boolean }
export const runGuards = (claim: string, sentence: string): Guards => ({ numbers: numbersGuard(claim, sentence), direction: directionGuard(claim, sentence), negation: negationGuard(claim, sentence), scope: scopeGuard(claim, sentence), framed: framed(sentence) && !framed(claim) });

/** Share of the claim's subject words that the sentence also has. Used to rank sentences, never to verify. */
export function coverage(claim: string, sentence: string): number {
  const mine = subjectWords(claim);
  return mine.length ? overlap(mine, subjectWords(sentence)) / mine.length : 0;
}
