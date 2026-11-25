import { isAim, isFinding, sentences, type SentenceAt } from '@/core/challenge/challenge';
import type { Source } from '@/core/contracts';
import { findInstructions } from '@/core/pdf/injection';

/**
 * The Analyst sorts a paper's own sentences into what they are about. It writes nothing:
 * every line it shows is an exact slice of the text we could read, so it cannot add a finding of its own.
 */
export type Part = 'aim' | 'method' | 'sample' | 'finding' | 'meaning' | 'limit' | 'next';

export const PARTS: { key: Part; title: string; ask: string; none: string }[] = [
  { key: 'aim', title: 'What it set out to do', ask: 'What is the research question?', none: 'The text does not say what it set out to do.' },
  { key: 'method', title: 'How it was done', ask: 'What method was used?', none: 'The text does not describe the method.' },
  { key: 'sample', title: 'Who or what was studied', ask: 'Who or what was studied?', none: 'The text does not give a sample.' },
  { key: 'finding', title: 'What it found', ask: 'What are the main findings?', none: 'No sentence reports a finding.' },
  { key: 'meaning', title: 'What the authors conclude', ask: 'What do the authors conclude?', none: 'The text does not state a conclusion.' },
  { key: 'limit', title: 'Limits the authors admit', ask: 'What are the limits?', none: 'The text admits no limits. Abstracts often leave them out, so read the paper.' },
  { key: 'next', title: 'What is still unknown', ask: 'What is still unknown?', none: 'The text names no open question.' },
];

const METHOD = /\b(randomi[sz]ed|randomly|experiment\w*|trial|survey(ed|s)?|interview(s|ed)?|questionnaire|regression|meta-analys[ie]s|systematic review|literature review|case study|field study|longitudinal|cross-sectional|quasi-experiment\w*|data(set)? (from|of|on)|the data comprise|(?:we|study) (used|use|collected|analy[sz]ed|conducted|surveyed|assigned|compared|searched|interviewed|classified)|participants were|qualitative|quantitative|preregistered|replications? of \d|model uses)\b/i;
const AIM = /\bwe (examined?|investigated?|study|studied|explored?|evaluated?|assess(ed)?|tested?|ask(ed)?|aim(ed)?|sought)\b/i;
const PEOPLE = /\b(?:over |about |some |around |~)?\d[\d,.]*(?:-|\s)(?:\w+[\s-]){0,4}?(participants?|students?|employees?|workers?|respondents?|professionals?|volunteers?|patients?|firms?|compan(?:y|ies)|papers?|studies|citations?|references?|stories|cases|countries|teachers?|managers?|people|children|adults|universities|schools|topics|journals?)\b/i;
const LIMIT = /\b(limitations?|limited (to|by)|caution|caveats?|cannot be generali[sz]ed|generali[sz]ab\w+|self-report\w*|problems remain|small sample|may not (apply|hold|generali[sz]e)|should be interpreted)\b/i;
const NEXT = /\b(future (research|work|stud(y|ies))|further (research|work|stud(y|ies)|investigation)|more research|remains? (unclear|unknown|to be (seen|explored|studied))|is unknown|little is known|not yet (known|understood)|research gaps?)\b/i;
const MEANING = /\b(we conclude|in conclusion|conclusions?:|(this|these) (\w+ ){0,2}(highlights?|implies|imply|underscores?|demonstrates?|suggests?)|implying that|implications? (for|of|include)|taken together|overall,)\b/i;

export interface Reading {
  parts: Record<Part, SentenceAt[]>;
  /** Sentences we could place, out of all of them. Shown, so a thin reading looks thin. */
  placed: number;
  total: number;
  ignored: number;
}

export function readPaper(text: string): Reading {
  const parts: Record<Part, SentenceAt[]> = { aim: [], method: [], sample: [], finding: [], meaning: [], limit: [], next: [] };
  const all = sentences(text);
  const used = new Set<number>();
  let ignored = 0;
  for (const s of all) {
    if (findInstructions(s.text).length) {
      ignored++;
      continue;
    }
    const put = (p: Part) => {
      parts[p].push(s);
      used.add(s.start);
    };
    // First match wins, so one sentence is not shown as two things. A sample may sit inside a method.
    if (NEXT.test(s.text)) put('next');
    else if (LIMIT.test(s.text)) put('limit');
    else if (MEANING.test(s.text) && !/\d\s?%/.test(s.text)) put('meaning');
    else if (METHOD.test(s.text) && !/\b(led to|increased|decreased|rose|fell|improved|raised|lowered|found that|results show|higher|lower)\b/i.test(s.text)) put('method');
    else if (isAim(s.text) || (AIM.test(s.text) && !/\d\s?%/.test(s.text))) put('aim');
    else if (isFinding(s.text)) put('finding');
    if (PEOPLE.test(s.text) && !/\d\s?%/.test(s.text)) put('sample');
  }
  return { parts, placed: used.size, total: all.length, ignored };
}

/** Rows for comparing papers side by side. Every cell is an exact sentence or "Not stated". */
export interface CompareRow { label: string; cells: string[][] }
export function compareTexts(sources: Pick<Source, 'text'>[]): CompareRow[] {
  const reads = sources.map((s) => (s.text ? readPaper(s.text) : null));
  return PARTS.map((p) => ({ label: p.title, cells: reads.map((r) => (r ? r.parts[p.key].map((s) => s.text) : [])) }));
}

const cell = (s: string): string => {
  // A leading = + - @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};
export const toCsv = (head: string[], rows: string[][]): string => [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');

/** A yes or no question turned into the claim behind it, so the Challenger has something to push against. */
export function claimFromQuestion(q: string): string {
  const t = q.trim().replace(/[?.\s]+$/, '').replace(/^SAMPLE:\s*/i, '');
  const m = t.match(/^(?:does|do|did|is|are|can|could|will|would|has|have|how does|how do|how can|how is|to what extent does|why does|why do)\s+(.+)$/i);
  const s = m ? m[1]! : t;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
