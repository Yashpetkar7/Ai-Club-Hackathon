import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { Packer } from 'docx';
import { beforeEach, describe, expect, it } from 'vitest';
import { checkDraft, findCitations, numberCitations } from '@/core/cite/draft';
import { STYLE_FILE, type StyleFiles } from '@/core/cite/engine';
import { toBibtex, toDocx, toRis, toText } from '@/core/cite/export';
import { exportSet, preflight } from '@/core/cite/preflight';
import type { CitationStyle, ReferenceCheck, RegistryRecord, Source, Verdict } from '@/core/contracts';
import { addWebPage, refFromLine, refsFromFile, webProblems } from '@/core/import/import';
import { statementLines } from '@/core/report/statement';
import { fromCrossref } from '@/core/registries/map';
import { parseBibtex, parseRis } from '@/core/verify/parse';
import { addSource, approveSource, createProject, editSource, recheckSource, recordAiDecision, setAiLevel } from '@/store/actions';
import { record as log } from '@/log/log';
import { db } from '@/store/db';

const store = JSON.parse(readFileSync('tests/unit/fixtures/registry.json', 'utf8'));
const real = (doi: string): RegistryRecord => fromCrossref(store[`https://api.crossref.org/works/${doi}`].body.message);
const f = (n: string): string => readFileSync(`public/styles/${n}`, 'utf8');
const files = (s: CitationStyle): StyleFiles => ({ style: f(`${STYLE_FILE[s]}.csl`), locales: { 'en-US': f('locales-en-US.xml'), 'en-GB': f('locales-en-GB.xml') } });
const check = (verdict: Verdict, record: RegistryRecord): ReferenceCheck => ({ verdict, reasons: [], fields: [], trace: [], checkedAt: '2026-11-25', record });
const NOY = real('10.1126/science.adh2586');
const BLOOM = real('10.1093/qje/qju032');
const KRUGMAN = real('10.1086/261763');
const src = (o: Partial<Source> & { id: string }): Source => ({ projectId: 'p', origin: 'search', keys: { found: true, checked: true, approved: true }, tags: [], notes: '', addedAt: '', ...o });
const good = src({ id: 'good', record: NOY, check: check('confirmed', NOY) });

beforeEach(async () => {
  await db.delete();
  await db.open();
});

/** Everything that must never leave. */
const BAD: [string, Source][] = [
  ['not approved', src({ id: 'b1', record: BLOOM, check: check('confirmed', BLOOM), keys: { found: true, checked: true, approved: false } })],
  ['approved but never checked', src({ id: 'b2', record: BLOOM, keys: { found: true, checked: false, approved: true } })],
  ['approved but not found', src({ id: 'b3', raw: { raw: 'x', title: 'An invented paper' }, keys: { found: false, checked: false, approved: true } })],
  ['retracted, no reason', src({ id: 'b4', record: { ...BLOOM, retracted: true }, check: check('retracted', BLOOM), keys: { found: true, checked: false, approved: true } })],
  ['wrong paper, no reason', src({ id: 'b5', record: BLOOM, check: check('wrong-paper', BLOOM), keys: { found: true, checked: false, approved: false } })],
  ['a web page nobody gave a reason for', src({ id: 'b6', origin: 'web', raw: { raw: 'x', title: 'A page', url: 'https://example.org' }, keys: { found: false, checked: false, approved: true } })],
  ['a reason but no approval', src({ id: 'b7', record: BLOOM, check: check('details-differ', BLOOM), keys: { found: true, checked: false, approved: false }, keptWithReason: 'I think it is fine' })],
  ['no title', src({ id: 'b8', origin: 'web', raw: { raw: 'x' }, keys: { found: false, checked: false, approved: true }, keptWithReason: 'a long enough reason' })],
];

describe('nothing bad can leave', () => {
  it.each(BAD)('%s: pre-flight holds it and every exporter refuses it', async (_n, bad) => {
    const p = preflight([good, bad]);
    expect(p.ready.map((s) => s.id)).toEqual(['good']);
    expect(p.blocked.map((b) => b.source.id)).toEqual([bad.id]);
    expect(p.blocked[0]!.why.length).toBeGreaterThan(0);
    expect(exportSet([good, bad]).map((s) => s.id)).toEqual(['good']);
    // Skip pre-flight on purpose and hand it straight to each exporter.
    expect(() => toBibtex([good, bad])).toThrow(/cannot be exported/);
    expect(() => toRis([good, bad])).toThrow(/cannot be exported/);
    expect(() => toText([good, bad], 'apa', files('apa'))).toThrow(/cannot be exported/);
    await expect(toDocx({ sources: [good, bad], style: 'apa', files: files('apa'), question: 'q' })).rejects.toThrow(/cannot be exported/);
  });

  it('a flagged source kept with a reason leaves, and the reason goes with it everywhere', async () => {
    const kept = src({ id: 'k', record: KRUGMAN, check: check('details-differ', KRUGMAN), keys: { found: true, checked: false, approved: true }, keptWithReason: 'I checked the printed copy in the library' });
    expect(preflight([good, kept]).withReason.map((s) => s.id)).toEqual(['k']);
    for (const out of [toBibtex([kept]), toRis([kept]), toText([kept], 'apa', files('apa'))]) expect(out).toContain('I checked the printed copy in the library');
    expect(await documentXml(await toDocx({ sources: [kept], style: 'apa', files: files('apa'), question: 'q' }))).toContain('I checked the printed copy in the library');
  });
});

async function documentXml(doc: Awaited<ReturnType<typeof toDocx>>): Promise<string> {
  // A Word file is a zip. Read the one part we need from its central directory.
  const b = Buffer.from(await Packer.toBuffer(doc));
  for (let i = b.indexOf('PK\x01\x02', 0, 'latin1'); i >= 0; i = b.indexOf('PK\x01\x02', i + 4, 'latin1')) {
    const name = b.toString('utf8', i + 46, i + 46 + b.readUInt16LE(i + 28));
    if (name !== 'word/document.xml') continue;
    const at = b.readUInt32LE(i + 42);
    const start = at + 30 + b.readUInt16LE(at + 26) + b.readUInt16LE(at + 28);
    const data = b.subarray(start, start + b.readUInt32LE(i + 20));
    return (b.readUInt16LE(i + 10) === 0 ? data : inflateRawSync(data)).toString('utf8');
  }
  throw new Error('no document.xml');
}

describe('Word file', () => {
  it('keeps the hanging indent, double spacing and italics', async () => {
    const xml = await documentXml(await toDocx({ sources: [good], style: 'apa', files: files('apa'), question: 'Does AI help?' }));
    expect(xml).toMatch(/<w:ind [^>]*w:left="720"[^>]*w:hanging="720"|<w:ind [^>]*w:hanging="720"[^>]*w:left="720"/);
    expect(xml).toContain('w:line="480"');
    const italics = [...xml.matchAll(/<w:r>(?:(?!<\/w:r>).)*<w:i\/>(?:(?!<\/w:r>).)*<w:t[^>]*>([^<]*)</g)].map((m) => m[1]).join('');
    expect(italics).toContain('Science');
    expect(italics).toContain('381');
    expect(italics).not.toContain('6654');
    expect(xml).toContain('References');
  });
  it('carries the draft and the AI-use statement', async () => {
    const xml = await documentXml(await toDocx({ sources: [good], style: 'apa', files: files('apa'), question: 'Q', draft: 'AI helped (Noy & Zhang, 2023).\n\nSecond paragraph.', statement: ['No calls are recorded.'] }));
    expect(xml).toContain('AI helped (Noy &amp; Zhang, 2023).');
    expect(xml).toContain('Second paragraph.');
    expect(xml).toContain('No calls are recorded.');
  });
  it('IEEE numbers follow the draft', async () => {
    const b = src({ id: 'b', record: BLOOM, check: check('confirmed', BLOOM) });
    const xml = await documentXml(await toDocx({ sources: [good, b], style: 'ieee', files: files('ieee'), question: 'Q', draft: 'First (Bloom et al., 2015). Then (Noy & Zhang, 2023; Bloom et al., 2015).' }));
    expect(xml).toContain('First [1]. Then [2], [1].');
    expect(xml.indexOf('Bloom')).toBeLessThan(xml.indexOf('Noy'));
  });
});

describe('BibTeX and RIS read back as the same work', () => {
  it('BibTeX', () => {
    const [r] = parseBibtex(toBibtex([good]));
    expect(r).toMatchObject({ title: NOY.title, authors: ['Noy', 'Zhang'], year: 2023, doi: NOY.doi });
  });
  it('RIS', () => {
    const [r] = parseRis(toRis([good]));
    expect(r).toMatchObject({ title: NOY.title, authors: ['Noy', 'Zhang'], year: 2023, doi: NOY.doi });
  });
  it('two works with the same key get different ones', () => expect(toBibtex([good, src({ id: 'g2', record: { ...NOY, doi: '10.1/x', id: 'x' }, check: check('confirmed', NOY) })])).toContain('{noy2023b,'));
  it('special characters are safe in BibTeX', () => expect(toBibtex([src({ id: 'z', record: { ...NOY, title: 'A & B: 50% of C_d {x}' }, check: check('confirmed', NOY) })])).toContain('A \\& B: 50\\% of C\\_d x'));
});

describe('the draft', () => {
  const lib = [good, src({ id: 'b', record: BLOOM, check: check('confirmed', BLOOM) })];
  it('finds bracketed and running citations', () => {
    const t = 'As shown (Noy & Zhang, 2023; see Bloom et al., 2015), and Smith and Lee (2019) agree (p < 0.05, Table 2).';
    expect(findCitations(t).map((c) => [c.family, c.year])).toEqual([['Noy', 2023], ['Bloom', 2015], ['Smith', 2019]]);
    for (const c of findCitations(t)) expect(t.slice(c.start, c.end)).toBe(c.text);
  });
  it('sorts cited, unknown, not approved and never cited', () => {
    const waiting = src({ id: 'w', record: KRUGMAN, check: check('confirmed', KRUGMAN), keys: { found: true, checked: true, approved: false } });
    const d = checkDraft('One (Noy & Zhang, 2023). Two (Okonjo, 2022). Three (Krugman, 1991). In brackets (Figure 2).', lib, [...lib, waiting]);
    expect(d.cited.map((c) => c.source.id)).toEqual(['good']);
    expect(d.unknown).toEqual(['Okonjo, 2022']);
    expect(d.notCitable.map((x) => x.source.id)).toEqual(['w']);
    expect(d.neverCited.map((s) => s.id)).toEqual(['b']);
  });
  it('the online year and the issue year both match', () => expect(checkDraft('(Bloom et al., 2014) and (Bloom et al., 2015)', lib).cited[0]!.times).toBe(2));
  it('a right name with a wrong year is not in the library', () => expect(checkDraft('(Noy & Zhang, 2019)', lib).unknown).toEqual(['Noy & Zhang, 2019']));
  it('only whole groups that are in the library become numbers', () => expect(numberCitations('a (Noy & Zhang, 2023) b (Okonjo, 2022) c (Noy & Zhang, 2023; Okonjo, 2022)', lib)).toBe('a [1] b (Okonjo, 2022) c (Noy & Zhang, 2023; Okonjo, 2022)'));
});

describe('adding sources', () => {
  it('the same DOI twice is one source', async () => {
    const p = await createProject('Does AI help students write?');
    const a = await addSource(p.id, 'doi', { check: check('confirmed', NOY) });
    const b = await addSource(p.id, 'bibtex', { check: check('confirmed', NOY), raw: { raw: 'x' } });
    expect(b.id).toBe(a.id);
    expect(await db.sources.count()).toBe(1);
  });
  it('reads a DOI, a DOI link and a title, and refuses two words', () => {
    expect(refFromLine(' https://doi.org/10.1126/science.adh2586 ')).toMatchObject({ doi: '10.1126/science.adh2586' });
    expect(refFromLine('Experimental evidence on productivity')).toMatchObject({ title: 'Experimental evidence on productivity' });
    expect(refFromLine('two words')).toBeNull();
    expect(refsFromFile('TY  - JOUR\nTI  - A title\nER  - ')!.kind).toBe('ris');
    expect(refsFromFile('just text')).toBeNull();
  });
  it('a web page needs a reason, is never checked, and is added once', async () => {
    const p = await createProject('Does AI help students write?');
    const page = { url: 'https://example.org/a', title: 'Guidance', author: 'Example University', year: '2025', site: 'Example' };
    const s = await addWebPage(p.id, page);
    expect(s.keys).toEqual({ found: false, checked: false, approved: false });
    expect((await addWebPage(p.id, page)).id).toBe(s.id);
    await expect(approveSource(s.id)).rejects.toThrow(/characters/);
    await approveSource(s.id, 'official guidance from the university');
    expect(preflight(await db.sources.toArray()).withReason).toHaveLength(1);
    expect(webProblems({ ...page, url: 'javascript:alert(1)' })).toHaveLength(1);
    expect(webProblems({ ...page, url: 'nope', title: '', year: '20' })).toHaveLength(3);
  });
  it('checking again with a worse answer takes the approval back', async () => {
    const p = await createProject('Does AI help students write?');
    const s = await addSource(p.id, 'doi', { check: check('confirmed', NOY), approve: true });
    expect(exportSet(await db.sources.toArray())).toHaveLength(1);
    await recheckSource(s.id, check('retracted', { ...NOY, retracted: true }));
    expect((await db.sources.get(s.id))!.keys).toEqual({ found: true, checked: false, approved: false });
    expect(exportSet(await db.sources.toArray())).toHaveLength(0);
  });
  it('a title may change its capitals and never its words', async () => {
    const p = await createProject('Does AI help students write?');
    const s = await addSource(p.id, 'doi', { check: check('confirmed', NOY), approve: true });
    await editSource(s.id, { citeTitle: NOY.title.toUpperCase() });
    await expect(editSource(s.id, { citeTitle: 'A different paper' })).rejects.toThrow(/capital/);
  });
});

describe('the AI-use statement says only what the log says', () => {
  it('changes when the log changes', async () => {
    const p = await createProject('Does AI help students write?', 'apa', 1);
    const read = async () => statementLines(await db.log.where('projectId').equals(p.id).sortBy('seq'), (await db.projects.get(p.id))!);
    expect((await read())[0]).toBe('No calls to a generative AI service are recorded in this project’s log.');
    await log(p.id, 'ai', 'ai.plan', 'answer used as a suggestion', { model: 'test-model', prompt: '{}' });
    await recordAiDecision(p.id, 'plan', { kept: ['a', 'b'], changed: [], rejected: ['c'] });
    const now = (await read()).join(' ');
    expect(now).toContain('test-model');
    expect(now).toContain('once to suggest search terms');
    expect(now).toContain('kept 2, changed 0 and rejected 1');
    await setAiLevel(p.id, 2);
    expect((await read()).join(' ')).toContain('1 level-change events are recorded');
    expect(now).not.toContain('language model ran on my own device');
    expect(now).not.toMatch(/sources? I cite|I approved/);
    await addSource(p.id, 'doi', { check: check('confirmed', NOY), approve: true });
    expect((await read()).join(' ')).toContain('1 source-approval events');
  });
});
