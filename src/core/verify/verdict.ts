import type { FieldDiff, RawReference, ReasonCode, ReferenceCheck, RegistryRecord, RegistryTrace, Verdict } from '@/core/contracts';
import { rwNotice, type RwEntry } from '@/core/registries/retractionWatch';
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
  /** A second, independent title search. Optional so recorded tests can leave it out; when present it is always asked. */
  openalexSearch?(query: string, hint?: { title?: string; year?: number }): Promise<RegistryRecord[]>;
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
  const BY: Partial<Record<FieldDiff['field'], ReasonCode>> = { title: 'TITLE_DIFFERS', year: 'YEAR_DIFFERS', container: 'JOURNAL_DIFFERS', volume: 'VOLUME_DIFFERS', issue: 'ISSUE_DIFFERS', pages: 'PAGES_DIFFERS' };
  for (const f of c.fields) if (!f.ok) r.push(BY[f.field] ?? (c.authorsUnknown ? 'AUTHORS_NOT_LISTED' : 'AUTHOR_DIFFERS'));
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

  const judge = async (rec: RegistryRecord, viaDoi: boolean, corroborated = false): Promise<ReferenceCheck> => {
    let c = compare(ref, rec);
    let record = rec;
    // A record without a DOI can still be vouched for by the other registry's own search finding the same work.
    let second: 'answered' | 'silent' | 'none' = corroborated ? 'answered' : 'none';
    if (rec.doi) {
      const oa = await timed(trace, 'openalex', () => reg.openalexByDoi(rec.doi!), (v) => (v ? 'match' : 'not-found'));
      second = oa.ok ? 'answered' : 'silent';
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
        // One registry may hold a longer title than the other. The student is right if either has their words.
        if (c.title < th.titleMatch && c.title >= 0.6 && oa.value.title) {
          const other = compare(ref, { ...rec, title: oa.value.title });
          if (other.title >= th.titleMatch) c = other;
        }
      }
    }
    if (record.doi && reg.retractionWatch) {
      const rw = await timed(trace, 'retraction-watch', () => reg.retractionWatch!(record.doi!), (v) => (v ? 'match' : 'not-found'), (v) => (v ? `${v.status === 'retracted' ? 'retraction' : 'expression of concern'} listed` : undefined));
      if (rw.ok) record = withRetractionWatch(record, rw.value);
    }
    const bareDoi = viaDoi && !ref.title && !ref.authors?.length && tokens(ref.raw).length <= 8;
    if (viaDoi && !bareDoi && ref.title && c.title < 0.6) return done('wrong-paper', ['DOI_IS_ANOTHER_PAPER'], record, c);
    // The DOI opens a work by entirely different people: not a typo in one name, a different paper's identity.
    if (viaDoi && !bareDoi && (ref.authors?.length ?? 0) > 0 && !c.authorsUnknown && record.authors.length > 0 && c.authors === 0 && !c.firstAuthor)
      return done('wrong-paper', ['DOI_IS_ANOTHER_PAPER', 'AUTHOR_DIFFERS'], record, c);
    if (record.retracted) return done('retracted', ['RETRACTED', ...(bareDoi ? [] : reasonsFrom(c))], record, c);
    // A clean match that only one registry could vouch for is never shown as Confirmed.
    const clean = (): ReferenceCheck => (second === 'answered' ? done('confirmed', [], record, c) : done('one-registry', ['SECOND_REGISTRY_UNREACHABLE'], record, c));
    if (bareDoi) return clean();
    const reasons = reasonsFrom(c);
    if (c.title >= th.titleMatch && !reasons.length) return clean();
    return done('details-differ', reasons.length ? reasons : ['TITLE_DIFFERS'], record, c);
  };

  /** A record OpenAlex found. It is not asked to vouch for itself: `second` is the Crossref or DataCite answer. */
  const judgeOpenAlex = async (rec: RegistryRecord, vouched: boolean): Promise<ReferenceCheck> => {
    const c = compare(ref, rec);
    let record = rec;
    if (record.doi && reg.retractionWatch) {
      const rw = await timed(trace, 'retraction-watch', () => reg.retractionWatch!(record.doi!), (v) => (v ? 'match' : 'not-found'));
      if (rw.ok) record = withRetractionWatch(record, rw.value);
    }
    if (record.retracted) return done('retracted', ['RETRACTED', ...reasonsFrom(c)], record, c);
    const reasons = reasonsFrom(c);
    if (c.title >= th.titleMatch && !reasons.length) return vouched ? done('confirmed', [], record, c) : done('one-registry', ['SECOND_REGISTRY_UNREACHABLE'], record, c);
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
    if (!ref.doi && webUrl(ref)) return done('web-source', ['WEB_SOURCE']);
    return done('not-found', ['NOT_ENOUGH_TO_SEARCH']);
  }

  const s = await timed(trace, 'crossref', () => reg.crossrefSearch(query), (v) => (v.length ? 'match' : 'no-match'), (v) => `${v.length} candidates`);
  const crTrace = trace[trace.length - 1]!;
  const o = reg.openalexSearch ? await timed(trace, 'openalex', () => reg.openalexSearch!(query, { ...(ref.title ? { title: ref.title } : {}), ...(ref.year ? { year: ref.year } : {}) }), (v) => (v.length ? 'match' : 'no-match'), (v) => `${v.length} candidates`) : null;
  const oaTrace = o ? trace[trace.length - 1]! : null;
  // Not found needs every registry asked to have answered. One silent registry makes it Could not check.
  if (!s.ok && (!o || !o.ok)) return done('could-not-check', ['REGISTRY_UNREACHABLE', ...(doiMissing ? (['DOI_DOES_NOT_EXIST'] as ReasonCode[]) : [])]);
  const pool = [...(s.ok ? s.value.map((r) => ({ r, from: 'crossref' as const })) : []), ...(o?.ok ? o.value.map((r) => ({ r, from: 'openalex' as const })) : [])];
  const ranked = pool.map((x) => ({ ...x, c: compare(ref, x.r) })).sort((a, b) => rank(b.c) - rank(a.c));
  const best = ranked[0];
  const credible = (x: (typeof ranked)[number]) => x.c.title >= th.titlePossible && !(!x.c.firstAuthor && x.c.authors === 0 && x.c.title < 0.97);
  const silent = !s.ok || (!!o && !o.ok);

  if (!best || !credible(best)) {
    if (s.ok) crTrace.status = 'no-match';
    if (o?.ok && oaTrace) oaTrace.status = 'no-match';
    if (doiUnknown || silent) return done('could-not-check', ['REGISTRY_UNREACHABLE', ...(doiMissing ? (['DOI_DOES_NOT_EXIST'] as ReasonCode[]) : [])]);
    // A web page is not a scholarly record. Saying "not found" would imply it is suspect.
    if (!ref.doi && webUrl(ref)) return done('web-source', ['WEB_SOURCE']);
    return done('not-found', doiMissing ? ['DOI_DOES_NOT_EXIST', 'NO_MATCH_IN_REGISTRIES'] : ['NO_MATCH_IN_REGISTRIES'], undefined, best?.c);
  }
  if (best.from === 'crossref' && oaTrace && o?.ok && !ranked.some((x) => x.from === 'openalex' && credible(x))) oaTrace.status = 'no-match';
  if (best.from === 'openalex' && s.ok && !ranked.some((x) => x.from === 'crossref' && credible(x))) crTrace.status = 'no-match';
  // The other registry's search found the same work (title and first author), so the record is vouched for twice.
  let other = ranked.some((x) => x.from !== best.from && x.c.title >= th.titleMatch && x.c.firstAuthor && (x.c.yearGap ?? 0) <= th.yearTolerance);
  // Found by OpenAlex: the second, independent voice must be Crossref or DataCite holding the same DOI.
  if (best.from === 'openalex' && best.r.doi) {
    const cr = await timed(trace, 'crossref', () => reg.crossrefByDoi(best.r.doi!), (v) => (v ? 'match' : 'not-found'));
    const dc = cr.ok && cr.value ? null : await timed(trace, 'datacite', () => reg.dataciteByDoi(best.r.doi!), (v) => (v ? 'match' : 'not-found'));
    const got = cr.ok && cr.value ? cr.value : dc?.ok ? dc.value : null;
    other = !!got && compare(ref, got).title >= th.titleMatch;
  }
  const res = best.from === 'openalex' ? await judgeOpenAlex(best.r, other) : await judge(best.r, false, !best.r.doi && other);
  // The DOI could not be looked up and the search led to a work with another DOI: we cannot tell which is right.
  if (doiUnknown && res.record?.doi !== ref.doi) return { ...res, verdict: 'could-not-check', reasons: ['REGISTRY_UNREACHABLE'] };
  if (doiMissing && res.verdict !== 'retracted') {
    return { ...res, verdict: 'details-differ', reasons: ['DOI_DOES_NOT_EXIST', ...res.reasons], fields: [...res.fields, { field: 'doi', given: ref.doi!, registry: res.record?.doi ?? 'none', score: 0, ok: false }] };
  }
  return res;
}

/** A link to an ordinary web page, not to a DOI or a scholarly landing page we can look up. */
export function webUrl(ref: RawReference): string | null {
  const u = ref.url ?? ref.raw.match(/https?:\/\/[^\s<>"]+/)?.[0];
  if (!u || /(^|\.)doi\.org\//i.test(u)) return null;
  return u.replace(/[.,;)]+$/, '');
}
