import type { RawReference, ReasonCode, ReferenceCheck, RegistryRecord, RegistryTrace, Verdict } from '@/core/contracts';
import { POLICY } from '@/policy/policy';
import { compare, rank, type Comparison } from './compare';
import { tokens } from './normalise';

/**
 * The Checker. Plain code, no AI, no randomness. Registries are passed in, so tests run offline.
 * A registry that fails to answer can never turn into a pass or a "not found".
 */
export interface Registries {
  /** null means the registry answered and has no such DOI. */
  crossrefByDoi(doi: string): Promise<RegistryRecord | null>;
  openalexByDoi(doi: string): Promise<RegistryRecord | null>;
  dataciteByDoi(doi: string): Promise<RegistryRecord | null>;
  doiExists(doi: string): Promise<boolean>;
  crossrefSearch(query: string): Promise<RegistryRecord[]>;
}

async function timed<T>(trace: RegistryTrace[], registry: RegistryTrace['registry'], run: () => Promise<T>, status: (v: T) => RegistryTrace['status'], note?: (v: T) => string | undefined): Promise<{ ok: true; value: T } | { ok: false }> {
  const t0 = Date.now();
  try {
    const value = await run();
    const n = note?.(value);
    trace.push({ registry, status: status(value), ms: Date.now() - t0, ...(n ? { note: n } : {}) });
    return { ok: true, value };
  } catch (e) {
    trace.push({ registry, status: 'error', ms: Date.now() - t0, note: e instanceof Error ? e.message.slice(0, 120) : 'no answer' });
    return { ok: false };
  }
}

const reasonsFrom = (c: Comparison): ReasonCode[] => {
  const r: ReasonCode[] = [];
  for (const f of c.fields) if (!f.ok) r.push(f.field === 'title' ? 'TITLE_DIFFERS' : f.field === 'year' ? 'YEAR_DIFFERS' : c.authorsUnknown ? 'AUTHORS_NOT_LISTED' : 'AUTHOR_DIFFERS');
  if (!r.includes('AUTHOR_DIFFERS') && !c.authorsUnknown && !c.firstAuthor) r.push('AUTHOR_DIFFERS');
  return r;
};

export async function checkReference(ref: RawReference, reg: Registries, now: () => string = () => new Date().toISOString()): Promise<ReferenceCheck> {
  const trace: RegistryTrace[] = [];
  const th = POLICY.thresholds;
  const done = (verdict: Verdict, reasons: ReasonCode[], record?: RegistryRecord, c?: Comparison): ReferenceCheck => ({
    verdict,
    reasons,
    fields: c?.fields ?? [],
    trace,
    checkedAt: now(),
    ...(record ? { record } : {}),
  });

  const judge = async (rec: RegistryRecord, viaDoi: boolean): Promise<ReferenceCheck> => {
    const c = compare(ref, rec);
    let record = rec;
    if (rec.doi && rec.registry === 'crossref') {
      const oa = await timed(trace, 'openalex', () => reg.openalexByDoi(rec.doi!), (v) => (v ? 'match' : 'not-found'));
      if (oa.ok && oa.value) {
        record = {
          ...rec,
          abstract: rec.abstract ?? oa.value.abstract,
          openAccessUrl: rec.openAccessUrl ?? oa.value.openAccessUrl,
          citedBy: oa.value.citedBy ?? rec.citedBy,
          references: oa.value.references ?? rec.references,
          openalexId: oa.value.openalexId,
          retracted: rec.retracted || oa.value.retracted,
        } as RegistryRecord;
      }
    }
    const bareDoi = viaDoi && !ref.title && !ref.authors?.length && tokens(ref.raw).length <= 8;
    if (viaDoi && !bareDoi && ref.title && c.title < 0.6) return done('wrong-paper', ['DOI_IS_ANOTHER_PAPER'], record, c);
    if (record.retracted) return done('retracted', ['RETRACTED', ...(bareDoi ? [] : reasonsFrom(c))], record, c);
    if (bareDoi) return done('confirmed', [], record, c);
    const reasons = reasonsFrom(c);
    if (c.title >= th.titleMatch && !reasons.length) return done('confirmed', [], record, c);
    return done('details-differ', reasons.length ? reasons : ['TITLE_DIFFERS'], record, c);
  };

  let doiMissing = false;
  let doiUnknown = false;
  if (ref.doi) {
    const cr = await timed(trace, 'crossref', () => reg.crossrefByDoi(ref.doi!), (v) => (v ? 'match' : 'not-found'));
    if (cr.ok && cr.value) return judge(cr.value, true);
    const dc = await timed(trace, 'datacite', () => reg.dataciteByDoi(ref.doi!), (v) => (v ? 'match' : 'not-found'));
    if (dc.ok && dc.value) return judge(dc.value, true);
    const ex = await timed(trace, 'doi.org', () => reg.doiExists(ref.doi!), (v) => (v ? 'match' : 'not-found'));
    if (ex.ok && !ex.value) doiMissing = true;
    else doiUnknown = true;
    if (!doiMissing && !ex.ok && !cr.ok) return done('could-not-check', ['REGISTRY_UNREACHABLE']);
  }

  const query = [ref.title, ...(ref.authors ?? []).slice(0, 4), ref.year].filter(Boolean).join(' ') || ref.raw;
  const searchable = tokens(query.replace(/\b10\.\d{4,9}\/\S+/g, '')).length >= 3;
  if (!searchable) {
    if (doiMissing) return done('not-found', ['DOI_DOES_NOT_EXIST']);
    if (doiUnknown) return done('could-not-check', ['REGISTRY_UNREACHABLE']);
    return done('not-found', ['NOT_ENOUGH_TO_SEARCH']);
  }

  const s = await timed(trace, 'crossref', () => reg.crossrefSearch(query), (v) => (v.length ? 'match' : 'no-match'), (v) => `${v.length} candidates`);
  if (!s.ok) return done('could-not-check', ['REGISTRY_UNREACHABLE', ...(doiMissing ? (['DOI_DOES_NOT_EXIST'] as ReasonCode[]) : [])]);
  const best = s.value.map((r) => ({ r, c: compare(ref, r) })).sort((a, b) => rank(b.c) - rank(a.c))[0];
  const last = trace[trace.length - 1]!;

  if (!best || best.c.title < th.titlePossible) {
    last.status = 'no-match';
    if (doiUnknown) return done('could-not-check', ['REGISTRY_UNREACHABLE']);
    return done('not-found', doiMissing ? ['DOI_DOES_NOT_EXIST', 'NO_MATCH_IN_REGISTRIES'] : ['NO_MATCH_IN_REGISTRIES']);
  }
  if (!best.c.firstAuthor && best.c.authors === 0 && best.c.title < 0.97) {
    last.status = 'no-match';
    return done('not-found', doiMissing ? ['DOI_DOES_NOT_EXIST', 'NO_MATCH_IN_REGISTRIES'] : ['NO_MATCH_IN_REGISTRIES'], undefined, best.c);
  }
  const res = await judge(best.r, false);
  if (doiMissing && res.verdict !== 'retracted') {
    return { ...res, verdict: 'details-differ', reasons: ['DOI_DOES_NOT_EXIST', ...res.reasons], fields: [...res.fields, { field: 'doi', given: ref.doi!, registry: res.record?.doi ?? 'none', score: 0, ok: false }] };
  }
  return res;
}
