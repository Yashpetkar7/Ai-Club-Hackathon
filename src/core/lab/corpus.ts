import type { RawReference } from '@/core/contracts';
import { fromCrossref } from '@/core/registries/map';
import { cleanTitle } from '@/core/verify/normalise';
import snapshot from './recorded-seeds.json';

export const FAILURE_FAMILIES = ['total-fabrication', 'part-corrupted', 'hijacked-identifier', 'placeholder', 'plausible-missing-title'] as const;
export type FailureFamily = (typeof FAILURE_FAMILIES)[number];
export type LabFamily = 'real' | FailureFamily;
export type LabExpectation = 'metadata-match' | 'retraction-flag' | 'reject-invented';

export interface LabProvenance {
  registry: 'crossref';
  doi: string;
  fixturePath: string;
  fixtureUrl: string;
  /** null is the response's message; otherwise message.items[itemIndex]. */
  itemIndex: number | null;
}

export interface LabMutation {
  method: 'compose-reference' | 'replace-author' | 'shift-year' | 'swap-doi' | 'placeholder' | 'append-title';
  baseCaseIds: string[];
  changedFields: ('title' | 'authors' | 'year' | 'doi' | 'raw')[];
}

export interface LabCase {
  id: string;
  family: LabFamily;
  title: string;
  label: string;
  invented: boolean;
  reference: RawReference;
  /** A declared expectation, never a verdict supplied to the checker. */
  expected: LabExpectation;
  explanation: string;
  provenance: LabProvenance[];
  mutation?: LabMutation;
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

export const CORPUS_MANIFEST = freezeDeep({
  version: '1',
  scope: 'metadata-checker',
  parserIncluded: false,
  recordingIsLive: false,
  source: { fixturePath: snapshot.fixturePath, sha256: snapshot.fixtureSha256 },
  selectionRule: snapshot.selectionRule,
  taxonomy: {
    brief: 'docs/team/HEMANTH.md, task 2',
    source: 'https://arxiv.org/abs/2602.05930',
    note: 'The five exercise families follow the team brief. Their proportions are a test design, not prevalence estimates from the paper.',
  },
  generationRule: 'Keep every selected control. Apply six fixed transformations to each of the first two DOI-sorted controls: complete invention, wrong author, wrong year, swapped real DOI, placeholder, and an added plausible title clause without a DOI. Never select cases by whether the checker catches them.',
  coverageNote: 'Eight controls have direct DOI recordings. Four additional real controls have captured search metadata but missing direct lookup recordings. New generated searches may also be unrecorded. Such replay gaps are unresolved, not live registry outages or successful rejections.',
  limits: [
    'Structured reference fields go directly to checkReference. This does not evaluate the paste parser or the complete user journey.',
    'Metadata matching does not establish scientific truth or whether a source supports a claim.',
    'This small fixed corpus is not representative of all disciplines, languages or citation formats.',
    'The retracted real control is expected to be flagged; that result is not a false alarm.',
    'Invented references are exercises, never citable sources. A search miss does not establish global nonexistence.',
    'Keep all misses, unexpected results and unavailable checks in later measurements. Do not replace cases to improve a score.',
  ],
});

/** A readable rendering of these structured fields, not a citation-style formatter. */
function reference(fields: Omit<RawReference, 'raw'>): RawReference {
  const who = fields.authors?.join(', ');
  const when = fields.year ? `(${fields.year})` : undefined;
  const parts = [who, when, fields.title, fields.doi ? `https://doi.org/${fields.doi}` : undefined].filter(Boolean);
  return { ...fields, ...(fields.authors ? { authors: [...fields.authors] } : {}), raw: parts.join('. ') };
}

function realControls(): LabCase[] {
  return snapshot.entries.map((entry) => {
    const record = fromCrossref(entry.record);
    if (!record.doi || !record.title || !record.authors.length || !record.year) throw new Error('A selected real control is missing recorded metadata. Review the corpus; do not fill fields from memory.');
    return {
      id: `real:${record.doi}`,
      family: 'real',
      title: cleanTitle(record.title),
      label: record.retracted ? 'Real reference; retracted' : 'Real reference',
      invented: false,
      reference: reference({ doi: record.doi, title: cleanTitle(record.title), authors: record.authors.slice(0, 3).map((a) => a.family), year: record.year }),
      expected: record.retracted ? 'retraction-flag' : 'metadata-match',
      explanation: 'Title, year, DOI and up to three author family names come from the captured Crossref record. A real reference is not proof that its findings are true.',
      provenance: [{ registry: 'crossref', doi: record.doi, fixturePath: snapshot.fixturePath, fixtureUrl: entry.fixtureUrl, itemIndex: entry.itemIndex }],
    };
  });
}

function inventedCase(id: string, family: FailureFamily, title: string, ref: RawReference, explanation: string, mutation: LabMutation, sources: LabCase[]): LabCase {
  return {
    id,
    family,
    title,
    label: 'Invented for this Lab; do not cite',
    invented: true,
    reference: ref,
    expected: 'reject-invented',
    explanation,
    provenance: sources.flatMap((s) => s.provenance.map((p) => ({ ...p }))),
    mutation,
  };
}

/** Fixed cases and transformations. Only this Lab function invents exercise references. */
export function buildCorpus(): LabCase[] {
  const controls = realControls();
  const cases: LabCase[] = [...controls];
  const adjective = ['Counterfactual', 'Imagined'];
  const subject = ['collaborative annotation', 'reflective notebooks'];

  controls.slice(0, 2).forEach((base, i) => {
    const donor = controls[i + 2]!;
    const otherDoi = controls[1 - i]!;
    const fields = { title: base.reference.title!, authors: [...base.reference.authors!], year: base.reference.year!, doi: base.reference.doi! };
    const suffix = String(i + 1);

    const inventedTitle = [adjective[i], 'evidence ledgers for', subject[i], 'in learning communities'].join(' ');
    const inventedAuthor = ['LabInventedAuthor', suffix].join('');
    cases.push(inventedCase(`invented:total:${suffix}`, 'total-fabrication', 'Entirely invented combination',
      reference({ title: inventedTitle, authors: [inventedAuthor], year: fields.year }),
      'Code composes a new title and an explicitly invented author. The year is borrowed from the control. No DOI or venue is invented; the result is not a real citation.',
      { method: 'compose-reference', baseCaseIds: [base.id], changedFields: ['title', 'authors', 'doi'] }, [base]));

    const wrongAuthors = [donor.reference.authors![0]!, ...fields.authors.slice(1)];
    cases.push(inventedCase(`invented:author:${suffix}`, 'part-corrupted', 'Author attached to the wrong work',
      reference({ ...fields, authors: wrongAuthors }),
      'The first author family name is replaced with one from a different captured work. The DOI, title and year still identify the original control.',
      { method: 'replace-author', baseCaseIds: [base.id, donor.id], changedFields: ['authors'] }, [base, donor]));

    cases.push(inventedCase(`invented:year:${suffix}`, 'part-corrupted', 'Year deliberately shifted',
      reference({ ...fields, year: fields.year - 7 }),
      'The recorded year is reduced by seven while the original DOI and other fields remain. This is a declared alteration, not a claim about another publication date.',
      { method: 'shift-year', baseCaseIds: [base.id], changedFields: ['year'] }, [base]));

    cases.push(inventedCase(`invented:identifier:${suffix}`, 'hijacked-identifier', 'A real DOI attached to another work',
      reference({ ...fields, doi: otherDoi.reference.doi! }),
      'The DOI is copied from another real control. The exercise invents the association, not the identifier.',
      { method: 'swap-doi', baseCaseIds: [base.id, otherDoi.id], changedFields: ['doi'] }, [base, otherDoi]));

    const placeholder = i === 0 ? ['[', 'citation', 'needed', ']'].join(' ') : ['TO', 'DO'].join('');
    cases.push(inventedCase(`invented:placeholder:${suffix}`, 'placeholder', 'Unfinished reference placeholder',
      { raw: placeholder },
      'This generated placeholder has too little reference information to search. It is not a real source.',
      { method: 'placeholder', baseCaseIds: [], changedFields: ['raw'] }, []));

    const { doi: _doi, ...withoutDoi } = fields;
    const addition = ['a replication across learning communities', 'a comparison of classroom settings'][i]!;
    cases.push(inventedCase(`invented:plausible-title:${suffix}`, 'plausible-missing-title', 'Plausible title with invented extra wording',
      reference({ ...withoutDoi, title: `${fields.title}: ${addition}` }),
      'Code adds a plausible clause absent from the captured title and removes the DOI. The title is an invented exercise; no claim of global nonexistence or semantic claim-checking is made.',
      { method: 'append-title', baseCaseIds: [base.id], changedFields: ['title', 'doi'] }, [base]));
  });
  return cases;
}

export const LAB_CORPUS: readonly LabCase[] = freezeDeep(buildCorpus());
