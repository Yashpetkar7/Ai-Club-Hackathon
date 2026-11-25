import { sentences } from '@/core/challenge/challenge';
import { content, inOrder, listStart, offLimits, overlaps, paragraphs, STOP, wordsOf, type Range } from './text';

/**
 * A small, rule-based writing check. Plain code, on this device, no AI, nothing is sent anywhere.
 * It corrects slips. It never rewrites a sentence, and it never touches quotations or citations.
 */
export interface Edit extends Range { text: string }
export interface Slip extends Range {
  rule: string;
  text: string;
  say: string;
  /** Only when one right answer exists. Every edit is applied by the student's click. */
  edits?: Edit[];
  group: 'repeat' | 'language';
}

const SPELL: Record<string, string> = Object.fromEntries(
  (
    'accomodate accommodate|acheive achieve|acheived achieved|accross across|adress address|agressive aggressive|alot a lot|apparant apparent|arguement argument|assesment assessment|basicly basically|becuase because|begining beginning|beleive believe|beleived believed|benifit benefit|benifits benefits|calender calendar|catagory category|collegue colleague|comittee committee|comparision comparison|concensus consensus|consistant consistent|critisism criticism|definately definitely|definitly definitely|dependance dependence|develope develop|developement development|dissapear disappear|effeciency efficiency|embarass embarrass|employes employees|enviroment environment|enviromental environmental|excercise exercise|existance existence|experiance experience|explaination explanation|familar familiar|finaly finally|foriegn foreign|futher further|goverment government|gaurantee guarantee|happend happened|hypothises hypothesis|immediatly immediately|implimentation implementation|independant independent|infered inferred|influencial influential|intresting interesting|knowlege knowledge|langauge language|liason liaison|maintainance maintenance|managment management|methodolgy methodology|necesary necessary|neccessary necessary|noticable noticeable|occassion occasion|occurance occurrence|occured occurred|occuring occurring|occurence occurrence|oppurtunity opportunity|orginal original|paralel parallel|particpants participants|percieve perceive|percieved perceived|performence performance|persistant persistent|posession possession|prefered preferred|privelege privilege|probaly probably|proccess process|publically publicly|questionaire questionnaire|recieve receive|recieved received|recomend recommend|recomendation recommendation|refered referred|relevent relevant|relient reliant|repitition repetition|resistence resistance|responsability responsibility|rythm rhythm|seperate separate|seperately separately|signficant significant|significent significant|similiar similar|sincerly sincerely|sponser sponsor|strenght strength|succesful successful|successfull successful|suprise surprise|technolgy technology|teh the|thier their|threshhold threshold|tommorow tomorrow|truely truly|untill until|usefull useful|vaccum vacuum|varient variant|wich which|wierd weird|writting writing'
  )
    .split('|')
    .map((p) => {
      const i = p.indexOf(' ');
      return [p.slice(0, i), p.slice(i + 1)];
    }),
);

/** American and British forms of the same word. Mixing them looks like two writers. */
const PAIRS: [RegExp, RegExp, string][] = [
  [/\bbehaviou?r/i, /\bbehavior/i, 'behaviour, behavior'],
  [/\bcolour/i, /\bcolor/i, 'colour, color'],
  [/\blabour/i, /\blabor(?!at)/i, 'labour, labor'],
  [/\bfavour/i, /\bfavor/i, 'favour, favor'],
  [/\bcentre/i, /\bcenter/i, 'centre, center'],
  [/\banalys(e|ed|es|ing)\b/i, /\banalyz(e|ed|es|ing)\b/i, 'analyse, analyze'],
  [/\borganisation/i, /\borganization/i, 'organisation, organization'],
  [/\bmodell(ed|ing)\b/i, /\bmodel(ed|ing)\b/i, 'modelled, modeled'],
  [/\bgeneralis/i, /\bgeneraliz/i, 'generalise, generalize'],
  [/\brecognis/i, /\brecogniz/i, 'recognise, recognize'],
  [/\bcharacteris(e|ed|es|ing)\b/i, /\bcharacteriz(e|ed|es|ing)\b/i, 'characterise, characterize'],
  [/\bemphasis(e|ed|es|ing)\b/i, /\bemphasiz(e|ed|es|ing)\b/i, 'emphasise, emphasize'],
];
/** "behaviour" itself also matches the loose first pattern, so the first side must hold the British letter. */
const BRITISH = /behaviour|colour|labour|favour|centre|analys|organis|modell|generalis|recognis|characteris|emphasis/i;

const SHORT: Record<string, string> = { "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "can't": 'cannot', "won't": 'will not', "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not', "hasn't": 'has not', "haven't": 'have not', "hadn't": 'had not', "couldn't": 'could not', "shouldn't": 'should not', "wouldn't": 'would not' };

/** Said with "an", although they start with a consonant letter, and the other way round. */
const AN_OK = /^(hour|honest|honour|honor|heir)/i;
const A_OK = /^(one|once|uni(?!n|m)|use|usu|uti|eu|ewe|ubiq|u-)/i;

const sameCase = (from: string, to: string): string => (from[0] === from[0]!.toUpperCase() && from[0] !== from[0]!.toLowerCase() ? to[0]!.toUpperCase() + to.slice(1) : to);

const TWICE_OK = new Set(['that', 'had', 'is', 'very', 'so']);
const PLURAL = 'results|findings|studies|authors|researchers|participants|students|scholars|employees|workers|teachers|managers|companies|sources|papers';
const SINGULAR = 'study|result|finding|paper|source|method|approach|claim|theory|model|factor|variable|participant|student|researcher|author';

type Rule = (text: string, add: (r: Range, say: string, fix?: string) => void) => void;

const RULES: Record<string, Rule> = {
  'Word typed twice': (t, add) => {
    for (const m of t.matchAll(/\b(\p{L}+)(\s+)(\1)\b/giu)) if (!TWICE_OK.has(m[1]!.toLowerCase())) add({ start: m.index, end: m.index + m[0].length }, `“${m[1]} ${m[3]}”`, m[1]!);
  },
  Spelling: (t, add) => {
    for (const m of t.matchAll(/\b\p{L}{3,}\b/gu)) {
      const fix = SPELL[m[0].toLowerCase()];
      if (fix) add({ start: m.index, end: m.index + m[0].length }, `“${m[0]}” is usually spelled “${fix}”.`, sameCase(m[0], fix));
    }
  },
  'A or an': (t, add) => {
    for (const m of t.matchAll(/\b(an?)\s+([\p{L}][\p{L}'’-]*)/giu)) {
      const w = m[2]!;
      // Letters said one by one (an MBA, a UK firm) are left alone.
      if (/^\p{Lu}{2,}/u.test(w) || w.length < 2) continue;
      const vowel = (/^[aeiou]/i.test(w) && !A_OK.test(w)) || AN_OK.test(w);
      const has = m[1]!.toLowerCase() === 'an';
      if (vowel === has || (has && /^h/i.test(w))) continue;
      // "Vitamin A is", "category a uses" and "a" as a label are not articles.
      if (m[1] === 'A' && m.index > 0 && !/[.!?\n]\s*$/.test(t.slice(Math.max(0, m.index - 3), m.index))) continue;
      add({ start: m.index, end: m.index + m[1]!.length }, `“${m[1]} ${w}”`, sameCase(m[1]!, vowel ? 'an' : 'a'));
    }
  },
  Spacing: (t, add) => {
    for (const m of t.matchAll(/(?<=\S)(?<![.!?:]) {2,}(?=\S)/g)) add({ start: m.index, end: m.index + m[0].length }, 'More than one space.', ' ');
    for (const m of t.matchAll(/(?<=[\p{L}\d)\]”"]) +(?=[,;:](?:\s|$)|\.(?:\s|$))/gu)) add({ start: m.index, end: m.index + m[0].length }, 'A space before a comma or full stop.', '');
    for (const m of t.matchAll(/(?<=\p{L}),(?=\p{L})/gu)) add({ start: m.index, end: m.index + 1 }, 'No space after a comma.', ', ');
    for (const m of t.matchAll(/(?<=\p{Ll}{2})([.!?])(?=\p{Lu}\p{Ll}+\s)/gu)) add({ start: m.index, end: m.index + 1 }, 'No space after a full stop.', `${m[1]} `);
  },
  'Capital letter': (t, add) => {
    for (const m of t.matchAll(/(?<=[\p{Ll}\d)\]”"]{2}[.!?]\s)(\p{Ll})(?=\p{Ll}*\s)/gu)) {
      const before = t.slice(Math.max(0, m.index - 14), m.index);
      if (/\b(al|e\.g|i\.e|vs|etc|cf|approx|no|vol|fig|eq|pp?|ed|eds|dr|mr|mrs|ms|st|ca|resp)\.\s$/i.test(before)) continue;
      add({ start: m.index, end: m.index + 1 }, 'A sentence starts with a small letter.', m[1]!.toUpperCase());
    }
    for (const m of t.matchAll(/(?<=\s)i(?=\s(?:am|was|have|had|will|would|can|could|think|believe|argue|found|find|used|chose|did|do)\b)/g)) add({ start: m.index, end: m.index + 1 }, '“I” is always a capital.', 'I');
  },
  'Easily confused words': (t, add) => {
    const swap = (re: RegExp, say: string, fix: (m: RegExpMatchArray) => string) => {
      for (const m of t.matchAll(re)) add({ start: m.index, end: m.index + m[0].length }, say, fix(m));
    };
    swap(/\b(could|should|would|must|might) of\b/gi, 'It is “have”, not “of”.', (m) => `${m[1]} have`);
    swap(/\b(more|less|rather|higher|lower|greater|better|worse|fewer|larger|smaller|other) then\b(?=\s+(?:an?|the|any|other|others|before|in|at|on|by|for|with|from|it|they|we|he|she|you|those|these|that|this|their|its|our|one|two|three|half|expected|usual|ever|normal|men|women|people|students|previous\w*|\d))/gi, 'Comparisons use “than”.', (m) => `${m[1]} than`);
    swap(/\b(the|an|no|positive|negative|significant|direct|any) affect (on|of)\b/gi, 'As a noun it is “effect”.', (m) => `${m[1]} effect ${m[2]}`);
    swap(/\b(was|were|is|are|been|be) effected by\b/gi, '“Affected by” means changed by. “Effected” means brought about.', (m) => `${m[1]} affected by`);
    swap(/\b(based) off(?: of)?\b/gi, '“Based on” is the usual form.', (m) => `${m[1]} on`);
    swap(/\b(this) (studies|results|findings|papers|methods|sources|effects|claims|factors|authors)\b/gi, '“These” goes with more than one.', (m) => `${sameCase(m[1]!, 'these')} ${m[2]}`);
    swap(new RegExp(`\\b(these|those) (${SINGULAR})\\b(?![-’'])`, 'gi'), '“This” or “that” goes with one.', (m) => `${sameCase(m[1]!, m[1]!.toLowerCase() === 'these' ? 'this' : 'that')} ${m[2]}`);
    const one: Record<string, string> = { show: 'shows', suggest: 'suggests', indicate: 'indicates', are: 'is', were: 'was' };
    swap(/\b(information|research|evidence|advice|feedback|software|literature)(?:s|es) (show|suggest|indicate|are|were|about|on|from|of|that)\b/gi, 'This word has no plural.', (m) => `${m[1]} ${one[m[2]!.toLowerCase()] ?? m[2]}`);
    swap(/\bdatas\b/gi, '“Data” is already more than one.', (m) => sameCase(m[0], 'data'));
    swap(/\b(amount) of (people|students|participants|employees|workers|studies|papers|sources|companies)\b/gi, 'Things you can count have a number.', (m) => `${sameCase(m[1]!, 'number')} of ${m[2]}`);
    swap(/\b(less) (people|students|participants|employees|workers|studies|papers|sources|companies)\b/gi, 'Things you can count are fewer.', (m) => `${sameCase(m[1]!, 'fewer')} ${m[2]}`);
  },
  Agreement: (t, add) => {
    const fix: Record<string, string> = { shows: 'show', suggests: 'suggest', indicates: 'indicate', argues: 'argue', finds: 'find', claims: 'claim', reports: 'report', reveals: 'reveal', was: 'were', has: 'have', is: 'are' };
    for (const m of t.matchAll(new RegExp(`\\b(${PLURAL})\\s+(shows|suggests|indicates|argues|finds|reveals|was|has|is)\\b`, 'gi'))) {
      // "The analysis of results shows" and "a review by three authors finds" are right.
      const before = t.slice(Math.max(0, m.index - 60), m.index);
      if (/\b(of|in|for|with|on|from|by|among|between|and|about|to|than|each|every|one|a|an|this|that)\s+(?:[\p{L}’'-]+\s+){0,3}$/iu.test(before)) continue;
      const at = m.index + m[0].length - m[2]!.length;
      add({ start: at, end: at + m[2]!.length }, `“${m[1]} ${m[2]}”`, fix[m[2]!.toLowerCase()]!);
    }
    for (const m of t.matchAll(/\b(they|we|these) (was|has|is)\b/gi)) {
      const at = m.index + m[0].length - m[2]!.length;
      add({ start: at, end: at + m[2]!.length }, `“${m[0]}”`, fix[m[2]!.toLowerCase()]!);
    }
    for (const m of t.matchAll(/\b(he|she|it) (have|were|are)\b/gi)) {
      // "if it were" and "does it have" are right.
      if (/\b(if|as though|wish|would|does|did|do|can|could|may|might|will|should|that)\s+$/i.test(t.slice(Math.max(0, m.index - 12), m.index))) continue;
      const at = m.index + m[0].length - m[2]!.length;
      add({ start: at, end: at + m[2]!.length }, `“${m[0]}”`, { have: 'has', were: 'was', are: 'is' }[m[2]!.toLowerCase()]!);
    }
  },
  Contraction: (t, add) => {
    for (const m of t.matchAll(/\b\p{L}+n[’']t\b/giu)) {
      const fix = SHORT[m[0].toLowerCase().replace('’', "'")];
      if (fix) add({ start: m.index, end: m.index + m[0].length }, 'Academic writing usually spells this out.', sameCase(m[0], fix));
    }
  },
};

/** Slips with one right answer, sentences that are hard to follow, and repetition. */
export function checkLanguage(draft: string): Slip[] {
  const skip = offLimits(draft);
  const end = listStart(draft);
  const out: Slip[] = [];
  for (const [rule, run] of Object.entries(RULES)) {
    const found: Slip[] = [];
    run(draft, (r, say, fix) => {
      if (overlaps(r, skip) || found.some((f) => r.start < f.end && r.end > f.start)) return;
      found.push({ ...r, rule, say, text: draft.slice(r.start, r.end), group: rule === 'Word typed twice' ? 'repeat' : 'language', ...(fix !== undefined ? { edits: [{ ...r, text: fix }] } : {}) });
    });
    // Extra spaces are one decision, not twenty.
    if (rule === 'Spacing' && found.length > 1) {
      const sorted = found.sort((a, b) => a.start - b.start);
      out.push({ ...sorted[0]!, say: `${found.length} places with a space too many or too few.`, text: '', edits: sorted.flatMap((f) => f.edits ?? []) });
    } else out.push(...found);
  }

  const body = draft.slice(0, end);
  const quotedOrCited = (r: Range) => overlaps(r, skip);
  const ss = sentences(body);
  for (const s of ss) {
    const n = wordsOf(s.text).length;
    if (n > 45) out.push({ start: s.start, end: s.end, rule: 'Long sentence', text: s.text, say: `${n} words. Most readers lose the thread after about 30.`, group: 'language' });
  }

  // Both spellings in the student's own words.
  const own = (re: RegExp): RegExpMatchArray | undefined => [...body.matchAll(new RegExp(re.source, 'gi'))].find((m) => !quotedOrCited({ start: m.index!, end: m.index! + m[0].length }));
  for (const [gb, us, name] of PAIRS) {
    const a = [...body.matchAll(new RegExp(gb.source, 'gi'))].find((m) => BRITISH.test(m[0]) && !quotedOrCited({ start: m.index, end: m.index + m[0].length }));
    const b = own(us);
    if (a && b) out.push({ start: b.index!, end: b.index! + b[0].length, rule: 'Two spellings', text: b[0], say: `You use both: ${name}. Choose one.`, group: 'language' });
  }

  for (const [open, close, name] of [['(', ')', 'bracket'], ['[', ']', 'square bracket'], ['“', '”', 'quotation mark']] as const) {
    const stack: number[] = [];
    let stray = -1;
    for (let i = 0; i < body.length; i++) {
      if (body[i] === open) stack.push(i);
      else if (body[i] === close && stack.pop() === undefined && stray < 0) stray = i;
    }
    const at = stray >= 0 ? stray : (stack[0] ?? -1);
    // "a)" and "1)" as list labels are not mistakes.
    if (at >= 0 && !(stray >= 0 && /(^|\s)[\da-z]{1,2}$/i.test(body.slice(Math.max(0, at - 3), at)))) out.push({ start: at, end: at + 1, rule: 'Missing pair', text: body.slice(Math.max(0, at - 20), at + 20).trim(), say: stray >= 0 ? `A ${name} closes but never opens.` : `A ${name} opens but never closes.`, group: 'language' });
  }

  out.push(...repeats(body));
  return out.sort((a, b) => a.start - b.start);
}

/** The same thing said twice, and one word used again and again in a paragraph. */
function repeats(body: string): Slip[] {
  const out: Slip[] = [];
  const skip = offLimits(body);
  const list = sentences(body).map((s) => ({ ...s, w: wordsOf(s.text).map((x) => x.t) })).filter((s) => s.w.length >= 7);
  for (let j = 1; j < list.length; j++)
    for (let i = 0; i < j; i++) {
      const a = list[i]!;
      const b = list[j]!;
      const longer = Math.max(a.w.length, b.w.length);
      if (Math.min(a.w.length, b.w.length) / longer < 0.75) continue;
      const same = inOrder(a.w, b.w) / longer;
      if (same < 0.8) continue;
      out.push({ start: b.start, end: b.end, rule: 'Said twice', text: b.text, say: same === 1 ? 'This sentence is in your draft twice.' : `Almost the same as: “${a.text}”`, group: 'repeat' });
      break;
    }
  for (const p of paragraphs(body)) {
    const ws = wordsOf(p.text).map((w) => ({ ...w, start: w.start + p.start, end: w.end + p.start })).filter((w) => !overlaps(w, skip));
    if (ws.length < 40) continue;
    const count = new Map<string, Range[]>();
    for (const w of ws) if (content(w.t) && w.t.length > 4 && !STOP.has(w.t) && !/^\d/.test(w.t)) count.set(w.t, [...(count.get(w.t) ?? []), w]);
    for (const [t, at] of count) if (at.length >= 5 && at.length / ws.length >= 0.04) out.push({ start: at[at.length - 1]!.start, end: at[at.length - 1]!.end, rule: 'Same word many times', text: t, say: `“${t}” ${at.length} times in one paragraph. That is fine for a key term.`, group: 'repeat' });
  }
  return out;
}

/** Applies edits from the end backwards, so earlier places stay right. */
export function applyEdits(text: string, edits: Edit[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}
