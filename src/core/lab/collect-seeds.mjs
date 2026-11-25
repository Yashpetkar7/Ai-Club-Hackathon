// Reproduce the version-one metadata excerpts. This does not make HTTP requests.
// A changed selection requires a corpus-version review, not removal of difficult cases.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const fixturePath = 'tests/unit/fixtures/registry.json';
const bytes = readFileSync(fixturePath);
const fixture = JSON.parse(bytes.toString('utf8'));
const sortDoi = (a, b) => a.record.DOI.toLowerCase() < b.record.DOI.toLowerCase() ? -1 : a.record.DOI.toLowerCase() > b.record.DOI.toLowerCase() ? 1 : 0;
const titleKey = (record) => String(record.title?.[0] ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const direct = Object.entries(fixture)
  .filter(([url, response]) => url.startsWith('https://api.crossref.org/works/') && response.status === 200 && response.body?.message?.DOI)
  .map(([fixtureUrl, response]) => ({ fixtureUrl, itemIndex: null, record: response.body.message }))
  .sort(sortDoi);
if (direct.length !== 8) throw new Error('The version-one selection expects eight direct Crossref records. Review a new corpus version before regenerating.');

const seenDois = new Set(direct.map((x) => x.record.DOI.toLowerCase()));
const seenTitles = new Set(direct.map((x) => titleKey(x.record)));
const types = new Set(['journal-article', 'proceedings-article', 'book-chapter', 'report']);
const candidates = Object.entries(fixture).flatMap(([fixtureUrl, response]) => response.status === 200 && Array.isArray(response.body?.message?.items)
  ? response.body.message.items.map((record, itemIndex) => ({ fixtureUrl, itemIndex, record }))
  : []).filter(({ record }) => record.DOI && titleKey(record) && types.has(record.type)
    && record.author?.some((a) => a.family) && Number.isInteger(record.issued?.['date-parts']?.[0]?.[0]))
  .sort(sortDoi);
const additional = [];
for (const entry of candidates) {
  const doi = entry.record.DOI.toLowerCase();
  const title = titleKey(entry.record);
  if (seenDois.has(doi) || seenTitles.has(title)) continue;
  additional.push(entry);
  seenDois.add(doi);
  seenTitles.add(title);
  if (additional.length === 4) break;
}
if (additional.length !== 4) throw new Error('Four additional distinct real records are required; do not manufacture missing metadata.');

const snapshot = {
  description: 'Unchanged metadata excerpts from the existing registry recording. This file is not an HTTP replay recording and does not fill missing request URLs.',
  fixturePath,
  fixtureSha256: createHash('sha256').update(bytes).digest('hex'),
  selectionRule: 'All eight direct Crossref records, including the retracted work; then the first four additional DOI-sorted records with a distinct title, named author, issued year, and type journal-article, proceedings-article, book-chapter or report. Selection precedes checker measurement.',
  entries: [...direct, ...additional],
};
writeFileSync('src/core/lab/recorded-seeds.json', JSON.stringify(snapshot, null, 2) + '\n');
console.log(JSON.stringify({ selected: snapshot.entries.length, direct: direct.length, searchMetadataOnly: additional.length, fixtureSha256: snapshot.fixtureSha256 }));
