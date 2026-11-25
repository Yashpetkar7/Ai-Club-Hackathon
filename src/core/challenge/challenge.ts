import { tokens } from '@/core/verify/normalise';

/**
 * The Challenger's plain-code half. It works out a search for the other side and points at sentences.
 * Direction here is a reading aid from word choice. It is never a verdict and never sets a label.
 */
const PAIRS: [string[], string[]][] = [
  [['increase', 'increases', 'increased', 'increasing', 'improve', 'improves', 'improved', 'improving', 'raise', 'raises', 'raised', 'rise', 'rises', 'rose', 'higher', 'greater', 'boost', 'boosts', 'boosted', 'enhance', 'enhances', 'enhanced', 'gain', 'gains', 'positive', 'positively', 'benefit', 'benefits', 'grew', 'grow', 'lifted', 'strengthens', 'strengthened'],
    ['decrease', 'decreases', 'decreased', 'decreasing', 'reduce', 'reduces', 'reduced', 'reducing', 'lower', 'lowers', 'lowered', 'fall', 'falls', 'fell', 'worse', 'worsen', 'worsens', 'worsened', 'harm', 'harms', 'harmed', 'hinder', 'hinders', 'decline', 'declines', 'declined', 'negative', 'negatively', 'drop', 'drops', 'dropped', 'fewer', 'weaken', 'weakens', 'weakened', 'impair', 'impairs', 'impaired', 'loss', 'losses']],
];
const UP = new Set(PAIRS[0]![0]);
const DOWN = new Set(PAIRS[0]![1]);
const NEGATE = new Set(['no', 'not', 'never', 'without', 'nor', 'neither', 'cannot', 'didnt', 'doesnt', 'dont', 'isnt', 'wasnt', 'fails', 'failed', 'lack', 'insignificant']);
const STOP = new Set('always never every everyone definitely clearly really simply significantly strongly generally often a an the and or of in on at to for from by with that this these those is are was were be been it its their they we our as than also can may might will would should could does do did has have had between among across into over under about how what which who when where while if then such both each most some any all very much many more less study studies paper research results findings find found show shows showed effect effects'.split(' '));
const OPPOSITE: Record<string, string> = { improve: 'reduce', improves: 'reduces', improved: 'reduced', increase: 'decrease', increases: 'decreases', increased: 'decreased', raises: 'lowers', raised: 'lowered', boosts: 'harms', boosted: 'harmed', benefits: 'harms', better: 'worse', higher: 'lower', lifted: 'lowered', reduce: 'increase', reduces: 'increases', reduced: 'increased', decrease: 'increase', decreases: 'increases', decreased: 'increased', lowers: 'raises', lowered: 'raised', harms: 'benefits', worse: 'better', lower: 'higher' };

export const contentWords = (s: string): string[] => tokens(s).filter((w) => w.length > 2 && !STOP.has(w) && !UP.has(w) && !DOWN.has(w) && !/^\d+$/.test(w));

/** Searches for the claim's subject with the direction turned round. */
export function oppositeQuery(claim: string): string {
  const words = tokens(claim).filter((w) => !STOP.has(w) || OPPOSITE[w]).filter((w) => !/^\d+$/.test(w));
  const turned = words.map((w) => OPPOSITE[w] ?? w);
  const flipped = turned.some((w, i) => w !== words[i]);
  return [...turned.slice(0, 9), ...(flipped ? [] : ['no effect'])].join(' ');
}

export const claimQuery = (claim: string): string => tokens(claim).filter((w) => !STOP.has(w) && !/^\d+$/.test(w)).slice(0, 9).join(' ');

/** Says what a study set out to do, not what it found. Never evidence for either side. */
export const isAim = (s: string): boolean =>
  /\b(this|the|our|present) (\w+ ){0,3}(study|paper|research|article|work|review|inquiry)\b[^.]{0,60}\b(investigat|examin|explor|aim|seek|evaluat|assess|analy[sz]|tries|attempt|stud(y|ies)|focus|review|identif)/i.test(s) ||
  /\b(aims?|purpose|objective|goal)s? (of|is|was|to)\b|\bwill (evaluate|examine|investigate|assess|explore)\b|\bwe (aim|seek|examine|investigate|explore|study)\b|\bthe question of\b|\b(whether|creating the question)\b/i.test(s) ||
  /^(purpose|objectives?|aims?|background)\b/i.test(s.trim()) ||
  /\bwe report (on )?(the )?results of\b/i.test(s) ||
  /\bstud(y|ies) (investigated|examined|explored|assessed|evaluated)\b/i.test(s);

/** Says what ought to be done, or that the answer depends. Neither side may claim it. */
const ADVICE = /\b(must|should|need to|needs to|ought to) be\b|\bit is (important|recommended|suggested)\b|\bso that\b|\bgood idea\b|\brecommend(ed|ation|ations|s)?\b/i;
const DEPENDS = /\bdepend(s|ed|ing)? (up)?on\b|\bvar(y|ies|ied) (by|across|with)\b|\bmixed (results|evidence|findings)\b|\binconclusive\b/i;
const FINDING = /\b(results?|findings?|found|find|reveal(s|ed)?|show(s|ed|n)?|indicat(e|es|ed)|evidence|demonstrat(e|es|ed)|significant(ly)?|led to|conclude[sd]?|suggest(s|ed)?)\b/i;

/** A past-tense result, a percentage or a reporting word. Without one, a sentence is background, not evidence. */
const RESULT = /\b(rose|fell|improved|increased|decreased|declined|reduced|raised|lowered|worsened|harmed|enhanced|boosted|grew|dropped|did not|does not|no (significant )?(effect|difference|association|relationship|impact))\b|\d\s?%/i;
export const isFinding = (s: string): boolean => !isAim(s) && (FINDING.test(s) || RESULT.test(s));

export interface SentenceAt { text: string; start: number; end: number }

/** Cuts text into sentences and keeps where each one sits, so a quote is always an exact slice. */
export function sentences(text: string): SentenceAt[] {
  const out: SentenceAt[] = [];
  // A sentence may end with a closing quote mark or bracket after its full stop.
  const re = /[^.!?]+(?:[.!?](?!["\u201d\u2019)\]]*(?:\s+[\p{Lu}"\u201c(]|\s*$))[^.!?]*)*[.!?]*["\u201d\u2019)\]]*/gu;
  for (const m of text.matchAll(re)) {
    const lead = m[0].length - m[0].trimStart().length;
    const t = m[0].trim();
    if (t.length > 20) out.push({ text: t, start: m.index + lead, end: m.index + lead + t.length });
  }
  return out;
}

const stem = (w: string): string => w.replace(/(?:ies)$/, 'y').replace(/(?:ing|ed|es|s)$/, '');

/** The sentence that shares most subject words with the claim, or null when none shares enough. */
export function closestSentence(text: string, claim: string): (SentenceAt & { score: number }) | null {
  const want = new Set(contentWords(claim).map(stem));
  if (want.size < 2) return null;
  let best: (SentenceAt & { score: number }) | null = null;
  for (const s of sentences(text)) {
    const have = new Set(contentWords(s.text).map(stem));
    let hit = 0;
    for (const w of want) if (have.has(w)) hit++;
    const score = hit / want.size;
    // A finding beats a statement of purpose, even when the purpose repeats more of the words.
    const rank = score + (isFinding(s.text) ? 0.25 : 0) + (isFinding(s.text) && /\d\s?%/.test(s.text) ? 0.1 : 0) - (isAim(s.text) ? 0.5 : 0);
    if (hit >= 2 && score >= 0.34 && (!best || rank > best.score)) best = { ...s, score: rank };
  }
  return best;
}

const NULL_RESULT = /\b(does|did|do|may) not matter\b|\blittle (or no )?(effect|impact|difference|evidence)\b|\bcancell?ed out\b|\b(is|are|was|were) offset by\b|\bno better\b/i;
const NO_EFFECT = /\b(no|not|nor|neither|without)\b[^.]{0,28}\b(significant(ly)?|measurable|clear)?\s*(effect|difference|association|relationship|impact|evidence)\b/i;

export type Lean = 'up' | 'down' | 'none' | 'mixed';

/** Which way the words of a sentence lean. Negation close before a direction word turns it into "none". */
export function lean(s: string, near?: Set<string>): Lean {
  const t = tokens(s);
  const close = (i: number): boolean => !near || t.slice(Math.max(0, i - 8), i + 9).some((w) => near.has(stem(w)));
  let up = 0;
  let down = 0;
  let noGain = 0;
  let noLoss = 0;
  t.forEach((w, i) => {
    const d = UP.has(w) ? 1 : DOWN.has(w) ? -1 : 0;
    if (!d || (w === 'higher' && /^(education|learning|school)/.test(t[i + 1] ?? '')) || (w === 'lower' && /^(secondary|school)/.test(t[i + 1] ?? '')) || !close(i)) return;
    if (t.slice(Math.max(0, i - 4), i).some((x) => NEGATE.has(x))) d > 0 ? noGain++ : noLoss++;
    else if (d > 0) up++;
    else down++;
  });
  // "A has no significant impact and B has a significant impact" says two things about two subjects.
  if (NO_EFFECT.test(s) && /\b(has|have|had|having) (a |an )?((positive|negative|strong|direct) )*(and )?significant(ly)? ((positive|negative|direct) )*(effect|impact|influence)/i.test(s)) return 'mixed';
  // A null result beside a direction word is not support for either side.
  if (NULL_RESULT.test(s)) return up || down ? 'mixed' : 'none';
  if (up && down) return 'mixed';
  if (up) return 'up';
  if (down) return 'down';
  if (noLoss) return 'mixed'; // "no negative effect" supports neither side
  return noGain || NO_EFFECT.test(s) ? 'none' : 'mixed';
}

/** Words that can stand for the same outcome. Short on purpose. */
const SAME_OUTCOME = ['performance', 'productivity', 'output', 'efficiency', 'grade', 'score', 'achievement', 'outcome', 'attainment'].map((w) => w.replace(/s$/, ''));

/** What the claim says changed: the last subject word after its direction word. "Positive view of ChatGPT" is not better performance. */
export function outcomeWords(claim: string): Set<string> {
  const t = tokens(claim);
  const at = t.findIndex((w) => UP.has(w) || DOWN.has(w));
  const after = contentWords(t.slice(at + 1).join(' '));
  const all = contentWords(claim);
  const last = (at >= 0 && after.length ? after : all).at(-1);
  if (!last) return new Set();
  const s = stem(last);
  return new Set(SAME_OUTCOME.map(stem).includes(s) ? SAME_OUTCOME.map(stem) : [s]);
}

/** Words too broad to say what a claim is about, when a sharper one stands beside them. */
const BROAD = new Set(['work', 'working', 'use', 'using', 'tool', 'tools', 'system', 'systems', 'practice', 'practices', 'investing', 'investment', 'employee', 'employees', 'student', 'students']);
const SAME_SUBJECT = [
  ['remote', 'remotely', 'telework', 'teleworking', 'telecommuting', 'home', 'wfh', 'hybrid'],
  ['chatgpt', 'genai', 'gai', 'generative', 'ai', 'gpt', 'llm', 'llms', 'chatbot', 'chatbots'],
];

/** True when the sentence is about what the claim is about. "Work discipline" is not "remote work". */
export function sameSubject(claim: string, sentence: string): boolean {
  const t = tokens(claim);
  const at = t.findIndex((w) => UP.has(w) || DOWN.has(w));
  const words = contentWords(t.slice(0, at < 0 ? t.length : at).join(' '));
  const sharp = words.filter((w) => !BROAD.has(w));
  const need = sharp.length ? sharp : words;
  if (!need.length) return true;
  const raw = new Set(tokens(sentence));
  const have = new Set([...raw].map(stem));
  const met = need.filter((w) => have.has(stem(w)) || SAME_SUBJECT.some((g) => g.includes(w) && g.some((x) => raw.has(x))));
  return met.length >= Math.ceil(need.length * 0.6);
}

export type Side = 'same' | 'other' | 'unclear';

export function side(claim: string, sentence: string): Side {
  if (!isFinding(sentence) || ADVICE.test(sentence) || DEPENDS.test(sentence) || !sameSubject(claim, sentence)) return 'unclear';
  const a = lean(claim);
  const b = lean(sentence, outcomeWords(claim));
  if (a === 'mixed' || b === 'mixed') return 'unclear';
  return a === b ? 'same' : 'other';
}

/** Percentages in the claim that the sentence does not have, when the sentence has some. */
export function differentNumbers(claim: string, sentence: string): boolean {
  const nums = (s: string) => [...s.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|percent|per cent)/gi)].map((m) => Number(m[1]));
  const a = nums(claim);
  const b = nums(sentence);
  return a.length > 0 && b.length > 0 && a.some((n) => !b.includes(n));
}

export interface RiskInput { year?: number; container?: string; type?: string; side: Side }

/** Plain warnings about the evidence itself. */
export function evidenceRisks(found: RiskInput[], thisYear: number): string[] {
  const same = found.filter((f) => f.side === 'same');
  const out: string[] = [];
  if (same.length === 0) out.push('Nothing we found points the same way as your claim.');
  if (same.length === 1) out.push('Only one source points your way. One study is thin evidence.');
  const years = same.map((f) => f.year).filter((y): y is number => !!y);
  if (years.length && Math.max(...years) < thisYear - 10) out.push(`Your newest supporting source is from ${Math.max(...years)}.`);
  const venues = new Set(same.map((f) => f.container).filter(Boolean));
  if (same.length >= 3 && venues.size === 1) out.push('All your support comes from one journal.');
  if (same.length && same.every((f) => /posted-content|preprint/.test(f.type ?? ''))) out.push('All your support is preprints, which have not been peer reviewed.');
  if (found.some((f) => f.side === 'other')) out.push('At least one source points the other way. Say so in your writing, or narrow the claim.');
  return out;
}

export const OVERCLAIM = /\b(all|always|every|everyone|never|none|proves?|proven|guarantees?|undeniabl[ey]|definitely|causes?)\b/i;
