import type { RawReference, ReasonCode, ReferenceCheck, RegistryRecord, RegistryTrace, Verdict } from '@/core/contracts';
import { rwNotice, type RwEntry } from '@/core/registries/retractionWatch';
import { POLICY } from '@/policy/policy';
import { compare, rank, type Comparison } from './compare';
import { tokens, titleScore } from './normalise';

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
  /** OpenAlex by title, for a reference with no DOI that Crossref holds no clean match for. Optional. */
  openalexSearch?(title: string): Promise<RegistryRecord[]>;
  /** The shipped Retraction Watch index. null means it has no notice for this DOI. Optional: it can only add a warning. */
  retractionWatch?(doi: string): Promise<RwEntry | null>;
}

/**
 * Adds what Retraction Watch knows to a record. It can mark a work retracted or under concern and attach the reasons;
 * it never clears a retraction another registry reported. If the index cannot be read, the record is unchanged.
 */
export function withRetractionWatch(rec: RegistryRecord, e: RwEntry | null): RegistryRecord {
  if (!e) return rec;
  const n = rwNotice(e);
  const notices = [...(rec.notices ?? [])];
  const same = notices.findIndex((x) => x.kind === n.kind && (x.by === 'retraction-watch' || (!!n.doi && x.doi === n.doi)));
  if (same >= 0) notices[same] = { ...notices[same]!, ...(n.reasons ? { reasons: n.reasons } : {}) };
  else notices.unshift(n);
  const retracted = rec.retracted || e.status === 'retracted';
  return { ...rec, retracted, ...(retracted && !rec.retractedOn && e.on && e.status === 'retracted' ? { retractedOn: e.on } : {}), notices };
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

  // A web page is not a scholarly work. Searching scholarly registries for it would only end in a misleading "Not found".
  if (!ref.doi && ref.url && !/doi\.org/i.test(ref.url) && !(ref.title && ref.authors?.length && ref.year)) return done('could-not-check', ['WEB_SOURCE']);

  // The DOI OpenAlex answered with on the last lookup. It can differ when OpenAlex merged versions of a work.
  let secondDoi: string | undefined;
  const judge = async (rec: RegistryRecord, viaDoi: boolean): Promise<ReferenceCheck> => {
    let c = compare(ref, rec);
    let record = rec;
    let second: 'matched' | 'silent' | 'missing' | 'disagrees' | 'none' = 'none';
    secondDoi = undefined;
    if (rec.doi) {
      const oa = await timed(trace, 'openalex', () => reg.openalexByDoi(rec.doi!), (v) => (v ? 'match' : 'not-found'));
      second = oa.ok ? 'missing' : 'silent';
      if (oa.ok && oa.value) {
        secondDoi = oa.value.doi;
        const identity = compare({ raw: rec.title, title: rec.title, authors: rec.authors.map((a) => a.family), ...(rec.year ? { year: rec.year } : {}) }, oa.value);
        const sameDoi = !oa.value.doi || oa.value.doi.toLowerCase() === rec.doi.toLowerCase();
        // With the same DOI, title and authors settle identity. OpenAlex gives the year of the earliest
        // version (a working paper, say), so a year gap alone is not another work. The student's year
        // is still compared with the first registry below.
        const fieldsAgree = identity.fields.every((f) => f.ok || (sameDoi && f.field === 'year'));
        second = sameDoi && titleScore(rec.title, oa.value.title) >= th.titleMatch && fieldsAgree ? 'matched' : 'disagrees';
        if (second === 'disagrees') {
          trace[trace.length - 1]!.status = 'no-match';
          trace[trace.length - 1]!.note = 'The second registry returned different identity metadata. Review both records.';
        }
        // Never attach an abstract, citation graph or retraction from a different work.
        if (second === 'matched') {
        record = {
          ...rec,
          abstract: rec.abstract ?? oa.value.abstract,
          openAccessUrl: rec.openAccessUrl ?? oa.value.openAccessUrl,
          citedBy: oa.value.citedBy ?? rec.citedBy,
          references: oa.value.references ?? rec.references,
          openalexId: oa.value.openalexId,
          retracted: rec.retracted || oa.value.retracted,
        } as RegistryRecord;
        // One registry may hold a longer title than the other. The student is right if either has their words.
        if (c.title < th.titleMatch && c.title >= 0.6 && oa.value.title) {
          const other = compare(ref, { ...rec, title: oa.value.title });
          if (other.title >= th.titleMatch) c = other;
        }
        }
      }
    }
    if (record.doi && reg.retractionWatch) {
      const rw = await timed(trace, 'retraction-watch', () => reg.retractionWatch!(record.doi!), (v) => (v ? 'match' : 'not-found'), (v) => (v ? `${v.status === 'retracted' ? 'retraction' : 'expression of concern'} listed` : undefined));
      if (rw.ok) record = withRetractionWatch(record, rw.value);
    }
    const bareDoi = viaDoi && !ref.title && !ref.authors?.length && tokens(ref.raw).length <= 8;
    if (viaDoi && !bareDoi && ref.title && c.title < 0.6) return done('wrong-paper', ['DOI_IS_ANOTHER_PAPER'], record, c);
    // None of the student's authors is on the DOI's record: the DOI belongs to other people's work, even with the same title.
    if (viaDoi && !bareDoi && (ref.authors?.length ?? 0) > 0 && !c.authorsUnknown && !c.firstAuthor && c.authors === 0) return done('wrong-paper', ['DOI_IS_ANOTHER_PAPER', 'AUTHOR_DIFFERS'], record, c);
    if (record.retracted) return done('retracted', ['RETRACTED', ...(bareDoi ? [] : reasonsFrom(c))], record, c);
    // Found by title alone, with no author, year or DOI to tell works apart: never Confirmed.
    if (!viaDoi && !ref.authors?.length && !ref.year) return done('details-differ', ['TITLE_ONLY'], record, c);
    // A clean match that only one registry could vouch for is never shown as Confirmed.
    const clean = (): ReferenceCheck => (second === 'matched' ? done('confirmed', [], record, c) : done('one-registry', [second === 'disagrees' ? 'REGISTRY_METADATA_DISAGREES' : second === 'missing' ? 'SECOND_REGISTRY_NO_RECORD' : 'SECOND_REGISTRY_UNREACHABLE'], record, c));
    if (bareDoi) return clean();
    const reasons = reasonsFrom(c);
    if (c.title >= th.titleMatch && !reasons.length) return clean();
    return done('details-differ', reasons.length ? reasons : ['TITLE_DIFFERS'], record, c);
  };

  /**
   * No DOI, and Crossref has no clean match: it may hold only a copy or another version, or nothing. Ask OpenAlex by
   * title too. A work found there is then looked up by its DOI in Crossref or DataCite, so OpenAlex never vouches for
   * itself as the second registry. Returns null when OpenAlex has nothing that fits better than \`beat\`.
   */
  const fromOpenAlexSearch = async (beat: number): Promise<ReferenceCheck | null> => {
    if (ref.doi || !ref.title || !reg.openalexSearch) return null;
    const o = await timed(trace, 'openalex', () => reg.openalexSearch!(ref.title!), (v) => (v.length ? 'match' : 'no-match'), (v) => `${v.length} candidates by title`);
    if (!o.ok) return null;
    const top = o.value.map((r) => ({ r, c: compare(ref, r) })).sort((a, b) => rank(b.c) - rank(a.c))[0];
    if (!top || top.c.title < th.titleMatch || (!top.c.firstAuthor && top.c.authors === 0) || rank(top.c) <= beat) {
      trace[trace.length - 1]!.status = 'no-match';
      return null;
    }
    if (top.r.doi) {
      const cr = await timed(trace, 'crossref', () => reg.crossrefByDoi(top.r.doi!), (v) => (v ? 'match' : 'not-found'));
      if (cr.ok && cr.value) return judge(cr.value, false);
      const dc = await timed(trace, 'datacite', () => reg.dataciteByDoi(top.r.doi!), (v) => (v ? 'match' : 'not-found'));
      if (dc.ok && dc.value) return judge(dc.value, false);
    }
    const reasons = reasonsFrom(top.c);
    return reasons.length ? done('details-differ', reasons, top.r, top.c) : done('one-registry', [top.r.doi ? 'SECOND_REGISTRY_NO_RECORD' : 'NO_DOI_ONE_REGISTRY'], top.r, top.c);
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
  const ranked = s.value.map((r) => ({ r, c: compare(ref, r) })).sort((a, b) => rank(b.c) - rank(a.c));
  const best = ranked[0];
  const last = trace[trace.length - 1]!;

  if (!best || best.c.title < th.titlePossible) {
    last.status = 'no-match';
    if (doiUnknown) return done('could-not-check', ['REGISTRY_UNREACHABLE']);
    const other = await fromOpenAlexSearch(-Infinity);
    if (other) return other;
    return done('not-found', doiMissing ? ['DOI_DOES_NOT_EXIST', 'NO_MATCH_IN_REGISTRIES'] : ['NO_MATCH_IN_REGISTRIES']);
  }
  if (!best.c.firstAuthor && best.c.authors === 0 && best.c.title < 0.97) {
    last.status = 'no-match';
    const other = await fromOpenAlexSearch(-Infinity);
    if (other) return other;
    return done('not-found', doiMissing ? ['DOI_DOES_NOT_EXIST', 'NO_MATCH_IN_REGISTRIES'] : ['NO_MATCH_IN_REGISTRIES'], undefined, best.c);
  }
  let res = await judge(best.r, false);
  // A search can rank a preprint level with the published article. When OpenAlex files the preprint
  // under another DOI that is also a candidate here and fits the reference just as well, judge that
  // version instead. Both lookups stay in the trace.
  const merged = secondDoi?.toLowerCase();
  if (res.reasons.includes('REGISTRY_METADATA_DISAGREES') && merged && merged !== best.r.doi?.toLowerCase()) {
    const alt = ranked.find((x) => x.r.doi?.toLowerCase() === merged);
    if (alt && rank(alt.c) >= rank(best.c) - 1e-9) {
      const again = await judge(alt.r, false);
      if (!again.reasons.includes('REGISTRY_METADATA_DISAGREES')) res = again;
    }
  }
  // Not a clean match by search alone: OpenAlex may hold the work itself where Crossref held a copy (a re-posted PDF, say).
  if (res.verdict !== 'confirmed' && res.verdict !== 'retracted') {
    const other = await fromOpenAlexSearch(rank(best.c));
    if (other) res = other;
  }
  // The DOI could not be looked up and the search led to a work with another DOI: we cannot tell which is right.
  if (doiUnknown && res.record?.doi !== ref.doi) return { ...res, verdict: 'could-not-check', reasons: ['REGISTRY_UNREACHABLE'] };
  if (doiMissing && res.verdict !== 'retracted') {
    return { ...res, verdict: 'details-differ', reasons: ['DOI_DOES_NOT_EXIST', ...res.reasons], fields: [...res.fields, { field: 'doi', given: ref.doi!, registry: res.record?.doi ?? 'none', score: 0, ok: false }] };
  }
  return res;
}
