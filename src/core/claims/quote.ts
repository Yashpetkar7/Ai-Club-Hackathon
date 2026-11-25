/**
 * Exact quotes. Only spacing and the shape of quote marks and dashes may differ.
 * A paraphrase returns null.
 */
const SAME: Record<string, string> = { '‘': "'", '’': "'", '‚': "'", '′': "'", '“': '"', '”': '"', '„': '"', '«': '"', '»': '"', '‐': '-', '‑': '-', '–': '-', '—': '-', '−': '-' };

/** One character in, one character out, so positions still point into the original text. */
function squash(s: string): { text: string; at: number[] } {
  let text = '';
  const at: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (/\s|[­​﻿]/.test(c)) {
      if (c === '­' || c === '​' || c === '﻿') continue;
      if (text.endsWith(' ') || text === '') continue;
      text += ' ';
    } else text += SAME[c] ?? c;
    at.push(i);
  }
  return { text, at };
}

export interface Span { start: number; end: number }

export function findQuote(quote: string, source: string): Span | null {
  const q = squash(quote).text.trim();
  if (q.length < 2) return null;
  const s = squash(source);
  let from = 0;
  for (;;) {
    const i = s.text.indexOf(q, from);
    if (i < 0) return null;
    const before = s.text[i - 1];
    const after = s.text[i + q.length];
    // "13%" must not be found inside "113%", nor "use" inside "used".
    const clean = (a: string | undefined, b: string | undefined) => !(a && b && /[\p{L}\p{N}]/u.test(a) && /[\p{L}\p{N}]/u.test(b));
    if (clean(before, q[0]) && clean(q[q.length - 1], after)) return { start: s.at[i]!, end: s.at[i + q.length - 1]! + 1 };
    from = i + 1;
  }
}

/** The claim word for word, apart from the first capital and the closing mark. */
export function quotesExactly(claim: string, passage: string): Span | null {
  const bare = claim.trim().replace(/^["“]|["”]$/g, '').replace(/[.!?]+$/, '');
  if (bare.split(/\s+/).length < 4) return null;
  const flip = (f: (c: string) => string) => f(bare[0]!) + bare.slice(1);
  return findQuote(bare, passage) ?? findQuote(flip((c) => c.toLowerCase()), passage) ?? findQuote(flip((c) => c.toUpperCase()), passage);
}
