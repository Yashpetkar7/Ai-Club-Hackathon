import type { CitationStyle, Source } from '@/core/contracts';
import { cleanTitle, stripTags } from '@/core/verify/normalise';
import { citeKey, sourceToCsl } from './csl';
import { checkDraft, numberCitations } from './draft';
import { formatSources, LIST_HEADING, type Entry, type StyleFiles } from './engine';
import { mustBeExportable, reasonNotes } from './preflight';

/** Every function here refuses a source that fails pre-flight. */

const NOTES = 'Notes on sources';

export function toText(sources: Source[], style: CitationStyle, files: StyleFiles): string {
  mustBeExportable(sources);
  const notes = reasonNotes(sources);
  return [LIST_HEADING[style], '', ...formatSources(sources, style, files).entries.map((e) => e.text), ...(notes.length ? ['', NOTES, '', ...notes] : [])].join('\n');
}

const BIB: Record<string, string> = { 'article-journal': 'article', 'paper-conference': 'inproceedings', book: 'book', chapter: 'incollection', report: 'techreport', thesis: 'phdthesis', webpage: 'misc', article: 'misc', dataset: 'misc', document: 'misc' };
const RIS: Record<string, string> = { 'article-journal': 'JOUR', 'paper-conference': 'CONF', book: 'BOOK', chapter: 'CHAP', report: 'RPRT', thesis: 'THES', webpage: 'ELEC', article: 'UNPB', dataset: 'DATA', document: 'GEN' };
const tex = (s: string): string => s.replace(/[\\{}]/g, '').replace(/([&%$#_])/g, '\\$1');
const line = (s: string): string => s.replace(/\s+/g, ' ').trim();

export function toBibtex(sources: Source[]): string {
  mustBeExportable(sources);
  const used = new Map<string, number>();
  return sources
    .map((s) => {
      const c = sourceToCsl(s, false)!;
      const base = `${citeKey(s).family.normalize('NFKD').replace(/[^A-Za-z]/g, '').toLowerCase() || 'source'}${citeKey(s).year ?? 'nd'}`;
      const n = used.get(base) ?? 0;
      used.set(base, n + 1);
      const authors = c.author.map((a) => (a.literal ? `{${tex(a.literal)}}` : [a.family, a.given].filter(Boolean).map((x) => tex(x!)).join(', '))).join(' and ');
      const f: [string, string | undefined][] = [
        ['title', `{${tex(c.title)}}`],
        ['author', authors || undefined],
        ['year', citeKey(s).year?.toString()],
        [c.type === 'article-journal' ? 'journal' : 'booktitle', c['container-title'] && tex(c['container-title'])],
        ['volume', c.volume],
        ['number', c.issue],
        ['pages', c.page?.replace('-', '--') ?? c.number],
        ['publisher', c.publisher && tex(c.publisher)],
        ['doi', c.DOI],
        ['url', c.DOI ? undefined : c.URL],
        ['note', s.keptWithReason ? tex(line(`Kept by the student with a reason: ${s.keptWithReason}`)) : undefined],
      ];
      return `@${BIB[c.type] ?? 'misc'}{${base}${n ? String.fromCharCode(96 + n + 1) : ''},\n${f.filter(([, v]) => v).map(([k, v]) => `  ${k} = {${v}}`).join(',\n')}\n}`;
    })
    .join('\n\n');
}

export function toRis(sources: Source[]): string {
  mustBeExportable(sources);
  return sources
    .map((s) => {
      const c = sourceToCsl(s, false)!;
      const [from, to] = (c.page ?? '').split('-');
      const rows: [string, string | undefined][] = [
        ['TY', RIS[c.type] ?? 'GEN'],
        ['TI', line(c.title)],
        ...c.author.map((a): [string, string] => ['AU', a.literal ?? [a.family, a.given].filter(Boolean).join(', ')]),
        ['PY', citeKey(s).year?.toString()],
        ['T2', c['container-title'] && stripTags(c['container-title'])],
        ['VL', c.volume],
        ['IS', c.issue],
        ['SP', c.number ?? (from || undefined)],
        ['EP', to],
        ['PB', c.publisher],
        ['DO', c.DOI],
        ['UR', c.DOI ? `https://doi.org/${c.DOI}` : c.URL],
        ['N1', s.keptWithReason ? line(`Kept by the student with a reason: ${s.keptWithReason}`) : undefined],
      ];
      return `${rows.filter(([, v]) => v).map(([k, v]) => `${k}  - ${v}`).join('\r\n')}\r\nER  - \r\n`;
    })
    .join('\r\n');
}

/** Word file. A hanging indent of half an inch and double spacing, with italics kept as real runs. */
export async function toDocx(o: { sources: Source[]; style: CitationStyle; files: StyleFiles; question: string; draft?: string; statement?: string[] }): Promise<import('docx').Document> {
  mustBeExportable(o.sources);
  const { AlignmentType, Document, HeadingLevel, Paragraph, TabStopType, TextRun } = await import('docx');
  const font = 'Times New Roman';
  const run = (t: string, x: { italics?: boolean; bold?: boolean } = {}) => new TextRun({ text: t, font, size: 24, ...x });
  const para = (t: string) => new Paragraph({ children: [run(t)], spacing: { line: 480 }, indent: { firstLine: 720 } });
  const head = (t: string, pageBreakBefore = false) => new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, pageBreakBefore, spacing: { line: 480 }, children: [new TextRun({ text: t, font, size: 24, bold: true, color: '000000' })] });
  let list = o.sources;
  const body: InstanceType<typeof Paragraph>[] = [];
  if (o.draft?.trim()) {
    if (o.style === 'ieee') {
      const cited = checkDraft(o.draft, o.sources).cited.sort((a, b) => a.order - b.order).map((c) => c.source);
      list = [...cited, ...o.sources.filter((s) => !cited.includes(s))];
    }
    const text = o.style === 'ieee' ? numberCitations(o.draft, o.sources) : o.draft;
    body.push(head(o.question), ...text.split(/\n+/).filter((x) => x.trim()).map(para));
  }
  const entry = (e: Entry) =>
    new Paragraph({
      spacing: { line: 480 },
      indent: { left: 720, hanging: 720 },
      tabStops: [{ type: TabStopType.LEFT, position: 720 }],
      children: [...(e.label ? [run(`${e.label}\t`)] : []), ...e.runs.map((r) => run(r.text, { ...(r.italic ? { italics: true } : {}), ...(r.bold ? { bold: true } : {}) }))],
    });
  const formatted = formatSources(list, o.style, o.files);
  body.push(head(LIST_HEADING[o.style], !!o.draft?.trim()), ...formatted.entries.map(entry));
  const notes = reasonNotes(list);
  if (notes.length) body.push(head(NOTES), ...notes.map(para));
  if (o.statement?.length) body.push(head('AI-use statement'), ...o.statement.map(para));
  return new Document({ creator: 'Paper Trail', title: cleanTitle(o.question), sections: [{ children: body }] });
}

export function saveFile(name: string, data: Blob | string, type = 'text/plain;charset=utf-8'): void {
  const url = URL.createObjectURL(typeof data === 'string' ? new Blob([data], { type }) : data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
