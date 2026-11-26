/**
 * Turns the support model's raw scores into three probabilities that add up to 1.
 * They say how this one sentence relates to the claim. They are not the chance that the claim is true.
 */
export interface ThreeWay { entails: number; neutral: number; contradicts: number }

export function threeWay(logits: ArrayLike<number>, id2label: Record<string, string>): ThreeWay {
  const raw = Array.from(logits);
  const max = Math.max(...raw);
  const exp = raw.map((x) => Math.exp(x - max));
  const sum = exp.reduce((a, b) => a + b, 0) || 1;
  const out: ThreeWay = { entails: 0, neutral: 0, contradicts: 0 };
  for (const [i, name] of Object.entries(id2label)) {
    const p = (exp[Number(i)] ?? 0) / sum;
    if (/entail/i.test(name)) out.entails = p;
    else if (/contradict/i.test(name)) out.contradicts = p;
    else if (/neutral/i.test(name)) out.neutral = p;
  }
  return out;
}

/**
 * Which sentence to start on: the one the model backs most. Ties keep the earlier one, so with no clear
 * winner the page starts on the closest sentence. -1 when nothing was scored. The student can pick another.
 */
export function mostSupported(scores: ({ entails: number } | null | undefined)[]): number {
  let best = -1;
  scores.forEach((s, i) => {
    if (s && (best < 0 || s.entails > scores[best]!.entails)) best = i;
  });
  return best;
}

/**
 * Where a page starts when several candidates were judged.
 * 1. A sentence that says the claim word for word and passes every check: the source says exactly this.
 * 2. Otherwise the weaker label wins: when any candidate disputes the claim, start on the one that disputes
 *    it most clearly, so a disagreement is never hidden behind a sentence that happens to agree.
 * 3. Otherwise the sentence the model backs most (the closest by words when the model is off).
 * Only chooses a starting sentence; every label still comes from judge(). The student can pick another.
 */
export function startAt(judged: { label: string; wordForWord?: boolean }[], scores: ({ entails: number; contradicts?: number } | null | undefined)[]): number {
  const exact = judged.findIndex((j) => j.label === 'verified' && j.wordForWord);
  if (exact >= 0) return exact;
  let disputed = -1;
  judged.forEach((j, i) => {
    if (j.label !== 'disputed') return;
    if (disputed < 0 || (scores[i]?.contradicts ?? 0) > (scores[disputed]?.contradicts ?? 0)) disputed = i;
  });
  if (disputed >= 0) return disputed;
  return Math.max(0, mostSupported(scores));
}
