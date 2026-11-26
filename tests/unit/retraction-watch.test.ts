// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RegistryRecord } from '@/core/contracts';
import { makeRetractionWatch, normDoi, retractionWatch, shardOf } from '@/core/registries/retractionWatch';
import { checkReference, withRetractionWatch, type Registries } from '@/core/verify/verdict';

/**
 * The index is built from the real Retraction Watch CSV by scripts/build-retraction-index.mjs.
 * The test paper below is a real entry in it: Molecular Neurobiology (2015), DOI 10.1007/s12035-015-9252-9,
 * retracted on 2026-03-28 with notice 10.1007/s12035-026-05837-5. Title and year are copied from the CSV.
 */
const RW_DOI = '10.1007/s12035-015-9252-9';
const RW_TITLE = 'Exacerbation of Methamphetamine Neurotoxicity in Cold and Hot Environments: Neuroprotective Effects of an Antioxidant Compound H-290/51';
const meta = JSON.parse(readFileSync('public/data/retraction-watch/meta.json', 'utf8'));

describe('the shipped Retraction Watch index', () => {
  it('was built from the full CSV and says where it came from', () => {
    expect(meta.url).toBe('https://gitlab.com/crossref/retraction-watch-data');
    expect(meta.csvSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(meta.counts.retracted).toBeGreaterThan(50_000);
    expect(meta.shards).toBe(256);
  });

  it('hashes DOIs the same way in the browser as the build script did', async () => {
    for (const d of [RW_DOI, '10.1126/science.adh2586', '10.1093/qje/qju032']) expect(await shardOf(d)).toBe(createHash('sha256').update(d).digest('hex').slice(0, 2));
  });

  it('finds a retracted paper with its date, notice and reasons', async () => {
    const e = await retractionWatch.lookup(RW_DOI);
    expect(e).toEqual({ status: 'retracted', on: '2026-03-28', notice: '10.1007/s12035-026-05837-5', reasons: expect.arrayContaining(['Falsification/Fabrication of Data', 'Investigation by Third Party']) });
  });

  it('reads DOIs written as links or in capitals', async () => {
    expect(normDoi('https://doi.org/10.1007/S12035-015-9252-9')).toBe(RW_DOI);
    expect((await retractionWatch.lookup('https://doi.org/10.1007/S12035-015-9252-9'))?.status).toBe('retracted');
  });

  it('has no entry for papers Retraction Watch never listed', async () => {
    expect(await retractionWatch.lookup('10.1126/science.adh2586')).toBeNull();
    // Retracted by its publisher (Crossref says so), but not in Retraction Watch. The two sources complement each other.
    expect(await retractionWatch.lookup('10.1108/jrit-01-2024-0017')).toBeNull();
  });

  it('throws, instead of saying "not listed", when the index cannot be read', async () => {
    const broken = makeRetractionWatch(async () => {
      throw new Error('offline');
    });
    await expect(broken.lookup(RW_DOI)).rejects.toThrow('offline');
  });
});

const record = (over: Partial<RegistryRecord> = {}): RegistryRecord => ({ registry: 'crossref', id: RW_DOI, doi: RW_DOI, title: RW_TITLE, authors: [{ family: 'Sharma', given: 'Hari Shanker' }], year: 2015, retracted: false, ...over });

describe('what the index may change', () => {
  it('adds a retraction another registry missed, with the reasons', () => {
    const out = withRetractionWatch(record(), { status: 'retracted', on: '2026-03-28', notice: '10.1007/s12035-026-05837-5', reasons: ['Falsification/Fabrication of Data'] });
    expect(out.retracted).toBe(true);
    expect(out.retractedOn).toBe('2026-03-28');
    expect(out.notices?.[0]).toMatchObject({ kind: 'retraction', by: 'retraction-watch', reasons: ['Falsification/Fabrication of Data'] });
  });

  it('never clears a retraction the publisher reported', () => {
    const rec = record({ retracted: true, retractedOn: '2024-05-01' });
    expect(withRetractionWatch(rec, null)).toBe(rec);
    expect(withRetractionWatch(rec, { status: 'concern', reasons: [] }).retracted).toBe(true);
  });

  it('attaches reasons to the same notice instead of listing it twice', () => {
    const rec = record({ retracted: true, notices: [{ kind: 'retraction', label: 'Retraction', by: 'retraction-watch', doi: '10.1007/s12035-026-05837-5' }] });
    const out = withRetractionWatch(rec, { status: 'retracted', notice: '10.1007/s12035-026-05837-5', reasons: ['Investigation by Third Party'] });
    expect(out.notices).toHaveLength(1);
    expect(out.notices?.[0]?.reasons).toEqual(['Investigation by Third Party']);
  });
});

describe('the checker with the index', () => {
  // Simulated registries: Crossref answers with the CSV's own metadata but WITHOUT the retraction, OpenAlex has nothing.
  const reg = (rw: Registries['retractionWatch']): Registries => ({
    crossrefByDoi: async () => record(),
    openalexByDoi: async () => null,
    dataciteByDoi: async () => null,
    doiExists: async () => true,
    crossrefSearch: async () => [],
    ...(rw ? { retractionWatch: rw } : {}),
  });

  it('turns a clean match into Retracted when Retraction Watch lists it', async () => {
    const c = await checkReference({ raw: RW_DOI, doi: RW_DOI }, reg((d) => retractionWatch.lookup(d)));
    expect(c.verdict).toBe('retracted');
    expect(c.trace.find((t) => t.registry === 'retraction-watch')).toMatchObject({ status: 'match' });
  });

  it('a failed index read changes nothing and is shown as an error, not a pass', async () => {
    const c = await checkReference({ raw: RW_DOI, doi: RW_DOI }, reg(async () => {
      throw new Error('offline');
    }));
    expect(c.verdict).toBe('confirmed');
    expect(c.trace.find((t) => t.registry === 'retraction-watch')).toMatchObject({ status: 'error' });
  });

  it('works the same without the index at all', async () => {
    const c = await checkReference({ raw: RW_DOI, doi: RW_DOI }, reg(undefined));
    expect(c.verdict).toBe('confirmed');
    expect(c.trace.some((t) => t.registry === 'retraction-watch')).toBe(false);
  });
});
