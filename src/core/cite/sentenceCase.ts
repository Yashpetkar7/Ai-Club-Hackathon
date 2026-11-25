import { cleanTitle } from '@/core/verify/normalise';

/** Names a computer can be sure about. Everything else that looked like a name is flagged for the student. */
const PROPER = new Set(
  'africa african america american americans asia asian australia australian austria austrian bangladesh bangladeshi belgium belgian brazil brazilian britain british canada canadian chile chilean china chinese colombia colombian denmark danish dubai dutch egypt egyptian emirates emirati england english europe european finland finnish france french german germany ghana greece greek gulf hong kong hungary hungarian india indian indians indonesia indonesian iran iranian iraq iraqi ireland irish islam islamic israel israeli italy italian japan japanese kenya kenyan korea korean kuwait latin london malaysia malaysian mexico mexican mumbai netherlands nigeria nigerian norway norwegian oman omani pakistan pakistani paris philippines poland portugal portuguese qatar qatari romania russia russian saudi scandinavian scotland scottish singapore singaporean spain spanish sweden swedish swiss switzerland sydney taiwan taiwanese thai thailand turkish uganda ukraine ukrainian vietnam vietnamese wales welsh york zealand january february april june july august september october november december monday tuesday wednesday thursday friday saturday sunday bayesian boolean cartesian cochrane darwin delphi facebook freud gaussian google hofstede instagram internet keynesian likert linkedin marx marxist maslow netflix newton pareto piaget poisson python twitter uber vygotsky whatsapp wikipedia youtube microsoft tesla nvidia openai christian muslim hindu jewish buddhist'.split(' '),
);
const LABELS = new Set('opinion paper review editorial commentary article research note letter case study perspective viewpoint introduction invited special issue report systematic literature'.split(' '));

const core = (w: string): string => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
const isCap = (w: string): boolean => /^\p{Lu}\p{Ll}/u.test(w);

/** ChatGPT, iPhone, COVID-19, AI, GPT-4, U.S.: the capitals carry meaning and stay. */
const keeps = (w: string, shouting: boolean): boolean => /\p{Ll}\p{Lu}/u.test(w) || /\d/.test(w) || /\p{L}\.\p{L}/u.test(w) || (!shouting && /^\p{Lu}{2,}s?$/u.test(w)) || PROPER.has(w.toLowerCase());

/** Capital on the first letter, past an opening quote or bracket. "iPhone" is left alone. */
const upFirst = (w: string): string => {
  const m = w.match(/^([^\p{L}\p{N}]*)(\p{L})([\s\S]*)$/u);
  if (!m || (/\p{Ll}/u.test(m[2]!) && /^\p{Lu}/u.test(m[3]!))) return w;
  return m[1]! + m[2]!.toUpperCase() + m[3]!;
};

export interface Cased {
  text: string;
  /** Words whose capitals the student should look at, because code cannot tell a name from an ordinary word. */
  check: string[];
}

function lowerWord(word: string, shouting: boolean, check: string[]): string {
  return word
    .split(/([-–—/])/)
    .map((part) => {
      const c = core(part);
      if (!c || c === 'I' || keeps(c, shouting)) return part;
      if (isCap(c) || shouting) {
        if (c.length > 1) check.push(c);
        return part.toLowerCase();
      }
      return /^\p{Lu}$/u.test(c) ? part.toLowerCase() : part;
    })
    .join('');
}

/** APA 7 sentence case: first word, first word after a colon, dash or end mark, and names. */
export function sentenceCase(title: string): Cased {
  const t = cleanTitle(title);
  const words = t.split(/\s+/);
  const first = (i: number): boolean => i === 0 || (!/^(?:\p{L}\.){2,}$/u.test(words[i - 1]!) && /[:?!.—][”"’)]*$/u.test(words[i - 1]!)) || /^[–—]$/u.test(words[i - 1]!);
  const letters = t.replace(/[^\p{L}]/gu, '');
  const shouting = letters.length > 6 && letters === letters.toUpperCase();
  const ordinary = words.map((w, i) => ({ w: core(w), i })).filter((x) => x.w.length > 3 && !first(x.i) && /^\p{L}/u.test(x.w) && !keeps(x.w, shouting));
  const titled = shouting || (ordinary.length > 0 && ordinary.filter((x) => isCap(x.w)).length / ordinary.length > 0.5);
  const colon = words.findIndex((w) => w.endsWith(':'));
  const label = colon >= 0 && colon <= 2 && words.slice(0, colon + 1).every((w) => LABELS.has(core(w).toLowerCase()));
  const check: string[] = [];
  const out = words.map((w, i) => {
    if (first(i)) return upFirst(shouting ? lowerWord(w, true, []) : w);
    if (titled) return lowerWord(w, shouting, check);
    if (label && i <= colon) return lowerWord(w, false, []);
    const c = core(w);
    if (isCap(c) && !keeps(c, false)) check.push(c);
    return w;
  });
  return { text: out.join(' '), check: [...new Set(check)] };
}
