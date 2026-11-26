/** Finds text inside a source that is addressed to an AI. Source text is data: we report it and never act on it. */
const PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget)\b[^.]{0,30}\b(previous|prior|above|earlier|all)\b[^.]{0,20}\b(instructions?|prompts?|rules?)\b/gi,
  /\byou are (now )?(an?|the) (ai|assistant|language model|chatbot|reviewer bot)\b/gi,
  /\bas an? (ai|large language model|language model|assistant),? (you|please|rate|mark|give|cite|approve)\b/gi,
  /\b(system prompt|developer message)\s*:/gi,
  /\b(ai|llm|model|assistant)s?\b[^.]{0,20}\b(must|should|please)\b[^.]{0,20}\b(mark|rate|label|approve|cite|recommend)\b/gi,
  /\bdo not (mention|reveal|flag) (this|these) (instruction|text|note)/gi,
  // Phase 2: role labels and rule overrides written into notes, quotes or references.
  /(^|[\s'"(\[])(system|developer|assistant)\s*:/gim,
  /\b(ignore|disregard|forget|override|bypass|disable)\b[^.]{0,40}\b(instructions?|prompts?|rules?|checks?|checking|guardrails?|verification)\b/gi,
  /\b(mark|set|label|change)\b[^.]{0,60}\b(as|to)\s+(verified|confirmed|approved|real|genuine)\b/gi,
];
export const findInstructions = (text: string): string[] => PATTERNS.flatMap((p) => [...text.matchAll(p)].map((m) => m[0].slice(0, 160)));
