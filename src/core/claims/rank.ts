import { isAim, sentences, type SentenceAt } from '@/core/challenge/challenge';
import type { Source } from '@/core/contracts';
import { findInstructions } from '@/core/pdf/injection';
import { coverage, numbers, subjectWords } from './guards';

export interface Ranked extends SentenceAt { score: number }

/** Sentences in one source, closest first. Word overlap only, no AI. */
export function rankSentences(text: string, claim: string, max = 4): Ranked[] {
  const want = numbers(claim);
  return sentences(text)
    .map((s) => {
      const c = coverage(claim, s.text);
      const n = want.length && numbers(s.text).some((h) => want.some((w) => w.value === h.value && w.unit === h.unit)) ? 0.15 : 0;
      return { ...s, score: c + n - (isAim(s.text) ? 0.3 : 0) };
    })
    .filter((s) => s.score >= 0.25)
    .sort((a, b) => b.score - a.score || a.start - b.start)
    .slice(0, max);
}

export interface AskHit { source: Source; sentence: SentenceAt; score: number; matched: string[] }
export interface Asked { hits: AskHit[]; searched: Source[]; unreadable: Source[]; ignored: number }

const FLOOR = 0.5;
const QUESTION = new Set('does do did what how why when where who which whether is are can tell say says said know about there any evidence effect effects affect affects impact influence'.split(' '));

/** Answers come only from sentences in sources the student kept. Below the floor we say nothing. */
export function askLibrary(question: string, kept: Source[], max = 6): Asked {
  const searched = kept.filter((s) => s.text?.trim());
  const unreadable = kept.filter((s) => !s.text?.trim());
  const words = subjectWords(question).filter((w) => !QUESTION.has(w));
  let ignored = 0;
  if (!words.length) return { hits: [], searched, unreadable, ignored };
  const all = searched.flatMap((s) => sentences(s.text!).map((x) => ({ s, x })));
  const q = words.join(' ');
  // A word in few sentences says more about the question than a word in every one.
  const weight = new Map(words.map((w) => [w, Math.log(1 + all.length / (1 + all.filter(({ x }) => coverage(w, x.text) > 0).length))]));
  const total = [...weight.values()].reduce((a, b) => a + b, 0) || 1;
  const hits: AskHit[] = [];
  for (const { s, x } of all) {
    const matched = words.filter((w) => coverage(w, x.text) > 0);
    if (matched.length < Math.min(2, words.length)) continue;
    const share = matched.reduce((a, w) => a + weight.get(w)!, 0) / total;
    if (share < FLOOR || coverage(q, x.text) < 0.4) continue;
    if (findInstructions(x.text).length) {
      ignored++;
      continue;
    }
    hits.push({ source: s, sentence: x, matched, score: share - (isAim(x.text) ? 0.25 : 0) });
  }
  return { hits: hits.sort((a, b) => b.score - a.score).slice(0, max), searched, unreadable, ignored };
}
