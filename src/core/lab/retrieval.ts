import type { Support } from '@/core/claims/label';
import { hybridRank, type Embed } from '@/core/semantic/rank';
import { POLICY } from '@/policy/policy';
import { wilson, type Rate } from './metrics';

/**
 * Does finding sentences by meaning reach a supporting sentence more often than finding them by shared words?
 * For each true claim, both ways pick their top sentences and the support model scores every one. A "hit" is a top
 * sentence the model scores at or above the threshold. The model is the referee here, not a person who marked the
 * right sentence, so this measures agreement with the model. It only ranks; it never makes a label.
 */
export interface RetrievalItem { claim: string; text: string }
export interface Picked { text: string; entails: number | null }
export interface MethodResult { top1: boolean; top3: boolean; picked: Picked[] }
export interface RetrievalRow { claim: string; words: MethodResult; meaning: MethodResult }
export interface RetrievalSummary {
  n: number;
  threshold: number;
  rows: RetrievalRow[];
  words: { top1: Rate; top3: Rate };
  meaning: { top1: Rate; top3: Rate };
  /** Sentences the support model could not score. They never count as hits. */
  unscored: number;
}

export interface RetrievalOptions {
  embed: Embed;
  score: (premise: string, claim: string) => Promise<Support | null>;
  threshold?: number;
  onProgress?: (done: number, total: number) => void;
  /** Checked between claims. When it says stop, the run ends and returns null: a partial comparison is not shown as a result. */
  stopped?: () => boolean;
}

const hitWithin = (picked: Picked[], k: number, t: number): boolean => picked.slice(0, k).some((p) => p.entails !== null && p.entails >= t);

export async function compareRetrieval(items: readonly RetrievalItem[], o: RetrievalOptions): Promise<RetrievalSummary | null> {
  const t = o.threshold ?? POLICY.thresholds.supportVerified;
  const rows: RetrievalRow[] = [];
  let unscored = 0;
  for (const [i, it] of items.entries()) {
    if (o.stopped?.()) return null;
    const [byWords, byMeaning] = [await hybridRank(it.claim, it.text, undefined, { max: 3 }), await hybridRank(it.claim, it.text, o.embed, { max: 3 })];
    // The same sentence is scored once per claim.
    const scores = new Map<string, number | null>();
    for (const c of [...byWords, ...byMeaning]) {
      if (scores.has(c.text)) continue;
      const s = await o.score(c.text, it.claim).catch(() => null);
      if (!s) unscored++;
      scores.set(c.text, s ? s.entails : null);
    }
    const method = (list: { text: string }[]): MethodResult => {
      const picked = list.map((c) => ({ text: c.text, entails: scores.get(c.text) ?? null }));
      return { top1: hitWithin(picked, 1, t), top3: hitWithin(picked, 3, t), picked };
    };
    rows.push({ claim: it.claim, words: method(byWords), meaning: method(byMeaning) });
    o.onProgress?.(i + 1, items.length);
  }
  if (o.stopped?.()) return null;
  const rate = (key: 'words' | 'meaning', k: 'top1' | 'top3') => wilson(rows.filter((r) => r[key][k]).length, rows.length);
  return { n: rows.length, threshold: t, rows, words: { top1: rate('words', 'top1'), top3: rate('words', 'top3') }, meaning: { top1: rate('meaning', 'top1'), top3: rate('meaning', 'top3') }, unscored };
}
