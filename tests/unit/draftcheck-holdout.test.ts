import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RegistryRecord, Source } from '@/core/contracts';
import { checkCopied } from '@/core/draftcheck/copied';
import { applyEdits, checkLanguage } from '@/core/draftcheck/language';
import { fromCrossref } from '@/core/registries/map';
import { CLEAN2, CLOSE2, COPIED2, OWN2, SLIPS2 } from '../draft-holdout-set';

const ABS: Record<string, string> = JSON.parse(readFileSync('tests/unit/fixtures/abstracts.json', 'utf8'));
const store = JSON.parse(readFileSync('tests/unit/fixtures/registry.json', 'utf8'));
const rec = (doi: string): RegistryRecord | undefined => {
  const b = store[`https://api.crossref.org/works/${doi}`]?.body?.message;
  return b ? fromCrossref(b) : undefined;
};
const LIB: Source[] = Object.keys(ABS).map((doi) => ({
  id: doi, projectId: 'p', origin: 'doi', keys: { found: true, checked: true, approved: true }, tags: [], notes: '', addedAt: '2026-11-25', text: ABS[doi], textOrigin: 'abstract',
  ...(rec(doi) ? { record: rec(doi) } : { raw: { raw: doi, title: doi } }),
}) as Source);

// First run, 25 November 2026: copied 8 of 8, close 5 of 6, own words 0 of 10 flagged, slips 13 of 13, clean 0 of 20 flagged.
// The one miss rolled two source sentences into one. Neighbouring sentences are compared together since then.
describe('draft checks on sentences they were not tuned on', () => {
  it.each(COPIED2)('%s copied: %s', (doi, text) => expect(checkCopied(text, LIB).items.find((i) => i.kind === 'copied')?.source?.id).toBe(doi));
  it.each(CLOSE2)('%s close: %s', (doi, text) => expect(checkCopied(text, LIB).items[0]?.source?.id).toBe(doi));
  it.each(OWN2)('%s own words: %s', (_d, text) => expect(checkCopied(text, LIB).items).toEqual([]));
  it.each(SLIPS2)('%s: %s', (rule, before, after) => {
    const slip = checkLanguage(before).find((s) => s.rule === rule);
    expect(slip, JSON.stringify(checkLanguage(before))).toBeTruthy();
    expect(applyEdits(before, slip!.edits!)).toBe(after);
  });
  it.each(CLEAN2)('leaves alone: %s', (text) => expect(checkLanguage(text).map((s) => `${s.rule}: ${s.say}`)).toEqual([]));
});
