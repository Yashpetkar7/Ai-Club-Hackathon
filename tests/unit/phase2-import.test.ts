import { expect, it } from 'vitest';
import { refFromLine } from '@/core/import/import';
import { PACK } from '../phase2-pack';

it('a pasted full reference keeps title, authors and year for the Checker (STEP 1, original preserved)', () => {
  const a = refFromLine(PACK.A)!;
  expect(a.raw).toBe(PACK.A);
  expect(a.year).toBe(1981);
  expect(a.authors).toEqual(['Kahneman', 'Tversky']);
  expect(a.doi?.toLowerCase()).toBe('10.2307/1914185');
  const g = refFromLine(PACK.G)!;
  expect(g.title?.toLowerCase()).toBe('deep learning');
  expect(refFromLine('https://doi.org/10.1038/nature14539')).toEqual({ raw: 'https://doi.org/10.1038/nature14539', doi: '10.1038/nature14539' });
});
