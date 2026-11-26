import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromCrossref, fromOpenAlex, fromDataCite } from '../../src/core/registries/map.ts';
import { checkReference } from '../../src/core/verify/verdict.ts';

// Uses the existing repository's recorded provider payloads, never the network.
const fixture = JSON.parse(readFileSync('tests/unit/fixtures/registry.json', 'utf8'));
const payload = (prefix) => {
  const pair = Object.entries(fixture).find(([url]) => url.startsWith(prefix));
  if (!pair) throw new Error('No recording for this request');
  if (pair[1].status === 404) return null;
  if (pair[1].status !== 200) throw new Error(`Recorded HTTP ${pair[1].status}`);
  return pair[1].body;
};
const path = (doi) => doi.split('/').map(encodeURIComponent).join('/');
const reg = {
  crossrefByDoi: async (doi) => { const p = payload(`https://api.crossref.org/works/${path(doi)}`); return p ? fromCrossref(p.message) : null; },
  openalexByDoi: async (doi) => { const p = payload(`https://api.openalex.org/works/doi:${path(doi)}?`); return p ? fromOpenAlex(p) : null; },
  dataciteByDoi: async (doi) => { const p = payload(`https://api.datacite.org/dois/${path(doi)}`); return p ? fromDataCite(p.data) : null; },
  doiExists: async (doi) => { const p = payload(`https://doi.org/api/handles/${path(doi)}`); return !!p && p.responseCode === 1; },
  crossrefSearch: async () => { throw new Error('This focused replay has no title-search fixture.'); },
};
for (const doi of ['10.1126/science.adh2586', '10.1093/qje/qju032', '10.1038/s41598-023-41032-5']) {
  test(`recorded real source still confirms: ${doi}`, async () => {
    const r = await checkReference({ raw: doi, doi }, reg);
    assert.equal(r.verdict, 'confirmed', JSON.stringify(r.trace));
  });
}
test('a recorded second-registry response for another version stays unresolved', async () => {
  const doi = '10.1086/261763';
  const second = await reg.openalexByDoi(doi);
  assert.equal(second.doi, '10.3386/w3275');
  const r = await checkReference({ raw: doi, doi }, reg);
  assert.equal(r.verdict, 'one-registry');
  assert.deepEqual(r.reasons, ['REGISTRY_METADATA_DISAGREES']);
  assert.equal(r.record.doi, doi);
});
test('recorded metadata with a deliberately corrupted title is never confirmed', async () => {
  const doi = '10.1126/science.adh2586';
  const r = await checkReference({ raw: 'DELIBERATE TEST MUTATION', doi, title: 'DELIBERATE TEST MUTATION: unrelated title for a known identifier' }, reg);
  assert.equal(r.verdict, 'wrong-paper');
});
