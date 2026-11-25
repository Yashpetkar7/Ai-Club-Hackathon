/** Searches from the question, by plain code. Always includes one that looks for criticism. */
const STOP = new Set('a an the and or of in on at to for from by with without about into is are was were be been being do does did how what why when which who whom whose can could should would will may might must have has had it its this that these those there their they them we our you your i my me as than then so if not no yes also more most less least'.split(' '));

/** A first guess made by plain code, so level 0 works too. The Planner agent can improve on it at level 1 and above. */
export function suggestQueries(question: string): string[] {
  const words = question.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(Boolean);
  const key = words.filter((w) => !STOP.has(w.toLowerCase()));
  const base = key.join(' ');
  const out = [base];
  if (key.length >= 2) out.push(`${base} meta-analysis`, `${base} limitations criticism`);
  return [...new Set(out.filter(Boolean))];
}
