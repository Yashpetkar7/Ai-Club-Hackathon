import { loadClaimsEval, type ClaimsEval } from './claims-data';
import { claimBenchmark, referenceMetrics, type ClaimBenchmark, type ReferenceMetrics } from './metrics';
import { validateRecordedSample, type RecordedSample } from './sample';
import recorded from './sample-run.json';

export interface Benchmark {
  data: ClaimsEval;
  claims: ClaimBenchmark;
  sample: RecordedSample;
  references: ReferenceMetrics;
  /** How long checking the data and working out every number took in this browser. */
  ms: number;
}

/** Checks both recorded files, then works out every number. No network. Refuses data whose hash does not match. */
export async function loadBenchmark(): Promise<Benchmark> {
  const started = performance.now();
  const [data, sample] = await Promise.all([loadClaimsEval(), validateRecordedSample(recorded)]);
  const claims = claimBenchmark(data);
  const references = referenceMetrics(sample.payload.run.rows);
  return { data, claims, sample, references, ms: performance.now() - started };
}
