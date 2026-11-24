import Dexie, { type EntityTable } from 'dexie';
import type { Claim, LogEvent, Project, Source } from '@/core/contracts';

/** Everything stays in this browser. Nothing here is ever uploaded. */
class PaperTrailDb extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  sources!: EntityTable<Source, 'id'>;
  claims!: EntityTable<Claim, 'id'>;
  log!: EntityTable<LogEvent, 'seq'>;
  drafts!: EntityTable<{ id: string; projectId: string; html: string; updatedAt: string }, 'id'>;

  constructor() {
    super('paper-trail');
    this.version(1).stores({
      projects: 'id, createdAt',
      sources: 'id, projectId, [projectId+addedAt]',
      claims: 'id, projectId, sourceId',
      log: '++seq, projectId',
      drafts: 'id, projectId',
    });
  }
}

export const db = new PaperTrailDb();

/** randomUUID is missing on plain http pages that are not localhost, so fall back to random bytes. */
export const newId = (): string => {
  const c = globalThis.crypto as Crypto & { randomUUID?: () => string };
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  return [...c.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
};
