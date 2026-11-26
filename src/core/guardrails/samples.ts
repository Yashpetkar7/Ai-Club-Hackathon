import type { RawReference, RegistryRecord } from '@/core/contracts';
import { loadClaimsEval } from '@/core/lab/claims-data';
import seeds from '@/core/lab/recorded-seeds.json';
import { fromCrossref } from '@/core/registries/map';
import type { Registries } from '@/core/verify/verdict';
import { parseReference } from '@/core/verify/parse';
import { AUDIT_SAMPLE } from '@/fixtures/audit-sample';
import { SAMPLE_TEXT } from '@/fixtures/sample';

/**
 * SAMPLE inputs for the guardrail checks. Every one is built from data already in this codebase:
 * - reference lines from the Audit and Check page samples (src/fixtures),
 * - Crossref records recorded once for the Integrity Lab (src/core/lab/recorded-seeds.json),
 * - the Bloom et al. (2015) abstract the Lab recorded from OpenAlex (src/core/lab/claims-eval.json).
 * Nothing here is typed in from memory. Registries are stand-ins that answer the way each check needs, and say so.
 */

const lineWith = (text: string, needle: string): string => {
  const line = text.split('\n').find((l) => l.toLowerCase().includes(needle.toLowerCase()));
  if (!line) throw new Error(`The sample text no longer has a reference with ${needle}.`);
  return line.trim();
};

/** Real. Bloom, Liang, Roberts and Ying (2015), from the Audit page sample. */
export const BLOOM_LINE = lineWith(AUDIT_SAMPLE, '10.1093/qje/qju032');
/** Invented on purpose: an AI typed this DOI from memory while the project was planned. From the Audit and Check samples. */
export const OKONJO_LINE = lineWith(AUDIT_SAMPLE, '10.1073/pnas.1523821113');
/** Real and retracted. Leelavathi and Surendhranatha (2024), from the Check page sample. */
export const RETRACTED_LINE = lineWith(SAMPLE_TEXT, '10.1108/JRIT-01-2024-0017');

export const bloomRef = (): RawReference => parseReference(BLOOM_LINE);
export const okonjoRef = (): RawReference => parseReference(OKONJO_LINE);
export const retractedRef = (): RawReference => parseReference(RETRACTED_LINE);

/** A Crossref record exactly as the Lab recorded it, mapped by the same code the live checker uses. */
export function recordedRecord(doi: string): RegistryRecord {
  const entry = seeds.entries.find((e) => e.itemIndex === null && String(e.record.DOI).toLowerCase() === doi.toLowerCase());
  if (!entry) throw new Error(`No recorded Crossref record for ${doi}.`);
  return fromCrossref(entry.record);
}

export const BLOOM_DOI = '10.1093/qje/qju032';
export const NOY_DOI = '10.1126/science.adh2586';
export const RETRACTED_DOI = '10.1108/jrit-01-2024-0017';

/** The same record as a second registry would hold it. A stand-in: the Lab has no recorded OpenAlex answer in src. */
export const asSecondRegistry = (r: RegistryRecord): RegistryRecord => ({ ...r, registry: 'openalex', id: `stand-in:${r.doi ?? r.id}` });

/** The Bloom et al. (2015) abstract, from the Lab's recorded data. Its hash is checked before it is used. */
export async function bloomAbstract(): Promise<string> {
  const data = await loadClaimsEval();
  const text = data.payload.abstracts[BLOOM_DOI];
  if (!text) throw new Error('The recorded Bloom et al. (2015) abstract is missing from the Lab data.');
  return text;
}

/** The one sentence of a text that holds these words. */
export function sentenceWith(text: string, words: string): string {
  const s = text.split(/(?<=[.!?])\s+/).find((x) => x.includes(words));
  if (!s) throw new Error(`No sentence holds “${words}”.`);
  return s.trim();
}

/** What a stand-in registry does: answer with a record, answer "no such record" (null), or not answer at all. */
export type Answer = RegistryRecord | null | 'silent';
export interface StandIn {
  crossref?: Answer;
  openalex?: Answer;
  datacite?: Answer;
  doiExists?: boolean | 'silent';
  search?: RegistryRecord[] | 'silent';
}

const silent = (): never => {
  throw new Error('SAMPLE stand-in: this registry did not answer.');
};
const give = async (a: Answer | undefined): Promise<RegistryRecord | null> => (a === 'silent' ? silent() : (a ?? null));

/** Registries for checkReference(), which takes them as a parameter. Nothing goes over the network. */
export function standInRegistries(o: StandIn): Registries {
  return {
    crossrefByDoi: () => give(o.crossref),
    openalexByDoi: () => give(o.openalex),
    dataciteByDoi: () => give(o.datacite),
    doiExists: async () => (o.doiExists === 'silent' ? silent() : (o.doiExists ?? false)),
    crossrefSearch: async () => (o.search === 'silent' ? silent() : (o.search ?? [])),
  };
}

/** Every registry silent: what a network outage looks like to the checker. */
export const allSilent = (): Registries => standInRegistries({ crossref: 'silent', openalex: 'silent', datacite: 'silent', doiExists: 'silent', search: 'silent' });
