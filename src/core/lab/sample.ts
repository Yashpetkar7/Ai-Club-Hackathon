import { CORPUS_MANIFEST, LAB_CORPUS } from './corpus';
import { immutable, type LabRun } from './runner';
import saved from './sample-run.json';

export interface RecordedSample {
  sha256: string;
  payload: {
    kind: 'recorded-replay';
    recordedAt: string;
    registryCapturedAt: null;
    timing: 'simulated-retry-clock';
    corpusHash: string;
    sourceHashes: Record<string, string>;
    run: LabRun;
  };
}

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const digestPattern = /^[a-f0-9]{64}$/;
async function digest(value: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('This browser cannot verify the recorded sample integrity. Live checks are still available when online.');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(bytes)].map((n) => n.toString(16).padStart(2, '0')).join('');
}

/** A content/identity check, not an external signature or proof that the history is complete. */
export async function validateRecordedSample(value: unknown): Promise<RecordedSample> {
  if (!object(value) || typeof value.sha256 !== 'string' || !digestPattern.test(value.sha256) || !object(value.payload)) throw new Error('The recorded sample has an invalid integrity envelope.');
  const payload = value.payload;
  if (await digest(payload) !== value.sha256) throw new Error('The recorded sample content hash does not match. No sample results were loaded.');
  if (payload.kind !== 'recorded-replay' || payload.registryCapturedAt !== null || payload.timing !== 'simulated-retry-clock') throw new Error('The recorded sample provenance is incomplete.');
  if (typeof payload.recordedAt !== 'string' || !Number.isFinite(Date.parse(payload.recordedAt))) throw new Error('The recorded replay execution time is missing.');
  if (!object(payload.sourceHashes) || Object.values(payload.sourceHashes).some((v) => typeof v !== 'string' || !digestPattern.test(v))) throw new Error('The recorded sample source hashes are invalid.');
  if (payload.sourceHashes[CORPUS_MANIFEST.source.fixturePath] !== CORPUS_MANIFEST.source.sha256) throw new Error('The recorded sample uses a different corpus source fixture.');
  if (payload.corpusHash !== await digest(LAB_CORPUS)) throw new Error('The recorded sample uses a different corpus snapshot.');
  if (!object(payload.run) || payload.run.mode !== 'sample' || payload.run.status !== 'completed') throw new Error('A recorded replay must stay labelled SAMPLE.');
  const run = payload.run;
  if (run.corpusVersion !== CORPUS_MANIFEST.version || !Array.isArray(run.rows) || run.rows.length !== LAB_CORPUS.length) throw new Error('The recorded sample corpus snapshot is incomplete.');
  if (JSON.stringify(run.rows.map((r: unknown) => object(r) ? r.case : null)) !== JSON.stringify(LAB_CORPUS)) throw new Error('The recorded sample cases differ from this corpus snapshot.');
  if (typeof run.startedAt !== 'string' || typeof run.finishedAt !== 'string' || typeof run.id !== 'string') throw new Error('The recorded replay run metadata is incomplete.');
  for (const row of run.rows) {
    if (!object(row) || !Array.isArray(row.missingReplay) || row.missingReplay.some((x) => typeof x !== 'string')) throw new Error('The recorded sample is missing replay coverage evidence.');
    if (row.state === 'error' && typeof row.error === 'string' && !row.check) continue;
    if (row.state !== 'completed' || !object(row.check) || typeof row.check.verdict !== 'string' || typeof row.check.checkedAt !== 'string' || !Array.isArray(row.check.reasons) || !Array.isArray(row.check.fields) || !Array.isArray(row.check.trace)) throw new Error('The recorded sample contains an incomplete checker result.');
  }
  return immutable(value as unknown as RecordedSample);
}

export const loadSample = (): Promise<RecordedSample> => validateRecordedSample(saved);
