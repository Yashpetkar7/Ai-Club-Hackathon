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
 * Where a page starts when several candidates were judged: a sentence that says the claim word for word and
 * passes every check, otherwise the closest sentence (first in the ranking). The other candidates stay on
 * screen with their scores, and one the model reads as against the claim is pointed out.
 *
 * Measured on the real models (tests/unit/best-candidate.test.ts, 80 false and 24 true claims, top 3):
 * starting on the closest sentence gave 0 false Verified, 72 false claims Disputed and no true claim Disputed.
 * Starting on the sentence the model backs most also gave 0 false Verified but only 44 to 52 Disputed.
 * Starting on any sentence that disputes the claim showed 5 or 6 true claims as Disputed.
 * Only chooses a starting sentence; every label still comes from judge(). The student can pick another.
 */
export function startAt(judged: { label: string; wordForWord?: boolean }[]): number {
  const exact = judged.findIndex((j) => j.label === 'verified' && j.wordForWord);
  return exact >= 0 ? exact : 0;
}
