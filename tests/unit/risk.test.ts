// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RegistryRecord } from '@/core/contracts';
import { retractionRisk, riskFacts, RISK_MODEL } from '@/core/risk/risk';

/** Metadata of a real Retraction Watch entry (see retraction-watch.test.ts), as Crossref would give it before the retraction. */
const rec = (over: Partial<RegistryRecord> = {}): RegistryRecord => ({
  registry: 'crossref',
  id: '10.1007/s12035-015-9252-9',
  doi: '10.1007/s12035-015-9252-9',
  title: 'Exacerbation of Methamphetamine Neurotoxicity in Cold and Hot Environments: Neuroprotective Effects of an Antioxidant Compound H-290/51',
  authors: [{ family: 'Sharma' }, { family: 'Kiyatkin' }, { family: 'Patnaik' }],
  year: 2015,
  container: 'Molecular Neurobiology',
  publisher: 'Springer Science and Business Media LLC',
  type: 'journal-article',
  retracted: false,
  ...over,
});

describe('the trained model file', () => {
  it('says how it was tested, and the test beats chance', () => {
    expect(RISK_MODEL.trainedOn.positives).toBeGreaterThan(1000);
    expect(RISK_MODEL.trainedOn.negatives).toBeGreaterThan(1000);
    expect(RISK_MODEL.test.auc).toBeGreaterThan(0.5);
    expect(RISK_MODEL.bands.p97).toBeGreaterThanOrEqual(RISK_MODEL.bands.p90);
  });
  it('matches the numbers in ml/results/risk.json', () => {
    const res = JSON.parse(readFileSync('ml/results/risk.json', 'utf8'));
    expect(res.test).toEqual(RISK_MODEL.test);
    expect(res.trainedOn).toEqual(RISK_MODEL.trainedOn);
  });
  it('reads the same facts the training script read', () => {
    expect(Object.keys(riskFacts(rec())).sort()).toEqual(Object.keys(RISK_MODEL.numeric).sort());
  });
});

describe('what the signal may say', () => {
  it('says nothing about records the model never saw: other registries, books, datasets', () => {
    expect(retractionRisk(rec({ registry: 'openalex' }))).toBeNull();
    expect(retractionRisk(rec({ type: 'book-chapter' }))).toBeNull();
  });
  it('is deterministic and gives a band and its reasons', () => {
    const a = retractionRisk(rec())!;
    expect(a).toEqual(retractionRisk(rec()));
    expect(['typical', 'higher', 'much-higher']).toContain(a.band);
    expect(a.because.length).toBeLessThanOrEqual(3);
  });
  it('moves with the publisher weight it learned, in the right direction', () => {
    const [high] = Object.entries(RISK_MODEL.publisher).sort((x, y) => y[1] - x[1])[0]!;
    const [low] = Object.entries(RISK_MODEL.publisher).sort((x, y) => x[1] - y[1])[0]!;
    expect(retractionRisk(rec({ publisher: high }))!.score).toBeGreaterThan(retractionRisk(rec({ publisher: low }))!.score);
  });
  it('is never read by the checker', () => {
    expect(readFileSync('src/core/verify/verdict.ts', 'utf8')).not.toMatch(/risk/i);
    expect(readFileSync('src/core/claims/label.ts', 'utf8')).not.toMatch(/risk/i);
  });
});
