// Builds the offline Retraction Watch index the browser looks up by DOI.
// Input:  datasets/raw/retraction_watch.csv (download it first, see datasets/README.md; not committed).
// Output: public/data/retraction-watch/meta.json and 256 small shards, one per first byte of the DOI's hash.
// No network access. The same CSV always gives the same files.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const SRC = process.argv[2] ?? 'datasets/raw/retraction_watch.csv';
const OUT = 'public/data/retraction-watch';

/** RFC 4180: quoted fields may hold commas, quotes and newlines. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Same rule as the app: lower case, no resolver prefix. */
export const normDoi = (d) => d.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '');
/** First byte of SHA-256 of the DOI, as two hex digits. The browser computes the same thing. */
export const shardOf = (doi) => createHash('sha256').update(doi).digest('hex').slice(0, 2);

/** "7/24/2026 0:00" -> "2026-07-24". */
const isoDate = (s) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s.trim());
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
};
const isDoi = (s) => /^10\.\d{4,9}\/\S+$/.test(normDoi(s));

const raw = readFileSync(SRC);
const sha256 = createHash('sha256').update(raw).digest('hex');
const [head, ...body] = parseCsv(raw.toString('utf8').replace(/^﻿/, ''));
const col = Object.fromEntries(head.map((h, i) => [h, i]));
for (const need of ['OriginalPaperDOI', 'RetractionNature', 'RetractionDate', 'RetractionDOI', 'Reason']) if (!(need in col)) throw new Error(`missing column ${need}`);

// Every notice for one paper, oldest first. The latest notice decides: a reinstatement cancels an earlier retraction.
const byDoi = new Map();
let skippedNoDoi = 0;
for (const r of body) {
  if (r.length < head.length - 1) continue;
  const doi = r[col.OriginalPaperDOI];
  if (!isDoi(doi)) {
    skippedNoDoi++;
    continue;
  }
  const d = normDoi(doi);
  const list = byDoi.get(d) ?? [];
  list.push({ nature: r[col.RetractionNature].trim(), date: isoDate(r[col.RetractionDate]), notice: isDoi(r[col.RetractionDOI]) ? normDoi(r[col.RetractionDOI]) : '', reasons: r[col.Reason].split(';').map((x) => x.trim().replace(/^\+/, '')).filter(Boolean) });
  byDoi.set(d, list);
}

const reasonIds = new Map();
const rid = (r) => {
  if (!reasonIds.has(r)) reasonIds.set(r, reasonIds.size);
  return reasonIds.get(r);
};

const shards = new Map();
const counts = { retracted: 0, concern: 0, reinstated: 0, correctionOnly: 0 };
for (const [doi, list] of byDoi) {
  list.sort((a, b) => a.date.localeCompare(b.date));
  const last = [...list].reverse().find((n) => n.nature !== 'Correction');
  if (!last) {
    counts.correctionOnly++;
    continue;
  }
  if (last.nature === 'Reinstatement') {
    counts.reinstated++;
    continue;
  }
  const status = last.nature === 'Retraction' ? 'R' : last.nature === 'Expression of concern' ? 'C' : null;
  if (!status) continue;
  counts[status === 'R' ? 'retracted' : 'concern']++;
  const reasons = [...new Set(list.filter((n) => n.nature !== 'Correction').flatMap((n) => n.reasons))].map(rid);
  const s = shardOf(doi);
  const shard = shards.get(s) ?? {};
  // [status, date of the deciding notice, DOI of that notice, reason ids]
  shard[doi] = [status, last.date, last.notice, reasons];
  shards.set(s, shard);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const [s, shard] of shards) writeFileSync(`${OUT}/${s}.json`, JSON.stringify(shard));
const latest = [...byDoi.values()].flat().map((n) => n.date).filter(Boolean).sort().at(-1);
const meta = {
  source: 'Retraction Watch database, made publicly available by Crossref',
  url: 'https://gitlab.com/crossref/retraction-watch-data',
  csvSha256: sha256,
  csvRows: body.length,
  latestNotice: latest,
  builtBy: 'scripts/build-retraction-index.mjs',
  rule: 'One entry per original-paper DOI. Notices sorted by date; corrections ignored; the latest remaining notice decides (Retraction = R, Expression of concern = C, Reinstatement = removed). Reasons are the union over those notices.',
  counts: { ...counts, dois: byDoi.size, skippedNoDoi },
  shards: shards.size,
  reasons: [...reasonIds.keys()],
};
writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 1));
console.log(JSON.stringify({ ...meta, reasons: meta.reasons.length }, null, 1));
