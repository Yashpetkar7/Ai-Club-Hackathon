import type { LogEvent, Source } from '../contracts';
import { findInstructions } from '../pdf/injection';

export const STUDY_STAGES = [
  { key: 'understand', title: 'Understand', prompt: 'In your own words, what question did the authors investigate?' },
  { key: 'capture', title: 'Capture evidence', prompt: 'Choose an exact passage you may want to use. We check it against the available text.' },
  { key: 'challenge', title: 'Think critically', prompt: 'What does this evidence leave uncertain? Name a limit, a missing detail or a question to check in another source.' },
  { key: 'recall', title: 'Recall and review', prompt: 'Without looking, explain the question, finding and a limitation. Then compare your answer with the source.' },
] as const;
export type StudyStage = typeof STUDY_STAGES[number]['key'];
export interface StudyEntry {
  version: 1; sourceId: string; fingerprint: string; stage: StudyStage; at: string;
  note?: string; quote?: string; start?: number; end?: number;
  confidence?: 'ready' | 'revisit'; dueAt?: string;
}
export type StudyProgress = Partial<Record<StudyStage, StudyEntry>>;

/** Full SHA-256 binds progress to the exact text and its provenance; it does not authenticate a PDF. */
export async function studyFingerprint(source: Source): Promise<string> {
  const input = JSON.stringify([source.projectId, source.id, source.record?.doi ?? source.raw?.url ?? '', source.textOrigin ?? '', source.text ?? '']);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function makeStudyEntry(source: Source, fingerprint: string, stage: StudyStage, input: { note?: string; quote?: string; confidence?: 'ready' | 'revisit' }, now = new Date()): StudyEntry {
  if (!source.text?.trim()) throw new Error('Add readable source text first.');
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('The source text has not been identified yet.');
  if (!STUDY_STAGES.some((s) => s.key === stage)) throw new Error('Unknown study step.');
  const entry: StudyEntry = { version: 1, sourceId: source.id, fingerprint, stage, at: now.toISOString() };
  if (stage === 'capture') {
    const quote = (input.quote ?? '').trim();
    const start = source.text.indexOf(quote);
    if (quote.length < 24 || quote.length > 6000 || start < 0) throw new Error('Choose at least 24 characters that are an exact passage from the available source text.');
    if (findInstructions(quote).length) throw new Error('This passage contains instructions aimed at an AI. Choose research content instead.');
    return { ...entry, quote, start, end: start + quote.length };
  }
  const note = (input.note ?? '').trim();
  if (note.length < 20 || note.length > 4000) throw new Error('Write between 20 and 4,000 characters in your own words.');
  if (stage !== 'recall') return { ...entry, note };
  if (input.confidence !== 'ready' && input.confidence !== 'revisit') throw new Error('First compare your answer with the source and choose a self-assessment.');
  return { ...entry, note, confidence: input.confidence, dueAt: new Date(now.getTime() + (input.confidence === 'ready' ? 86_400_000 : 0)).toISOString() };
}

/** Rebuild from validated student events; changed text and malformed events earn no completion. */
export function studyProgress(events: readonly LogEvent[], source: Source, fingerprint: string): StudyProgress {
  const progress: StudyProgress = {};
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if (event.projectId !== source.projectId || event.actor !== 'student' || event.action !== 'learning.completed') continue;
    try {
      const d = JSON.parse(event.detail) as StudyEntry | null;
      if (!d || d.version !== 1 || d.sourceId !== source.id || d.fingerprint !== fingerprint || !Number.isFinite(Date.parse(d.at))) continue;
      const valid = makeStudyEntry(source, fingerprint, d.stage, d, new Date(d.at));
      progress[valid.stage] = valid;
    } catch { /* Incomplete or obsolete event: no credit. */ }
  }
  return progress;
}

export const studyDue = (progress: StudyProgress, now = new Date()): boolean => !!progress.recall?.dueAt && Date.parse(progress.recall.dueAt) <= now.getTime();

export function studyNotes(source: Source, progress: StudyProgress): string {
  return [
    'Paper Trail · Study notes', source.record?.title ?? source.raw?.title ?? 'Source',
    source.record?.doi ? `https://doi.org/${source.record.doi}` : '',
    `Read from: ${source.textOrigin ?? 'available text'}.`,
    'Student notes and self-assessment. Completion does not verify understanding, authenticate the document or approve a citation.',
    ...STUDY_STAGES.map((s) => {
      const d = progress[s.key];
      return `${s.title}\n${d ? (d.quote ? `Exact passage from available text: “${d.quote}”` : d.note) : 'Not completed'}${d?.confidence ? `\nSelf-assessment: ${d.confidence}. Review due: ${d.dueAt}` : ''}`;
    }),
  ].filter(Boolean).join('\n\n');
}
