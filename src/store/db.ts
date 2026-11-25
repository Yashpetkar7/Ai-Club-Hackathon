import Dexie, { type EntityTable } from 'dexie';
import type { Claim, LogEvent, Project, Source } from '@/core/contracts';

/** Everything stays in this browser. Nothing here is ever uploaded. Each account has a library of its own. */
export class PaperTrailDb extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  sources!: EntityTable<Source, 'id'>;
  claims!: EntityTable<Claim, 'id'>;
  log!: EntityTable<LogEvent, 'seq'>;
  drafts!: EntityTable<{ id: string; projectId: string; html: string; updatedAt: string }, 'id'>;

  constructor(name: string = GUEST_DB) {
    super(name);
    this.version(1).stores({
      projects: 'id, createdAt',
      sources: 'id, projectId, [projectId+addedAt]',
      claims: 'id, projectId, sourceId',
      log: '++seq, projectId',
      drafts: 'id, projectId',
    });
  }
}

export const GUEST_DB = 'paper-trail';
export const libraryName = (accountId: string | null): string => (accountId ? `${GUEST_DB}-${accountId}` : GUEST_DB);

/** The library in use. Importers see the new one after switchLibrary, because module exports are live. */
export let db = new PaperTrailDb();

/** Null opens the guest library. Pages are remounted by the app when the account changes. */
export function switchLibrary(accountId: string | null): void {
  const name = libraryName(accountId);
  if (db.name === name) {
    if (!db.isOpen()) db = new PaperTrailDb(name);
    return;
  }
  db.close();
  db = new PaperTrailDb(name);
}

/** randomUUID is missing on plain http pages that are not localhost, so fall back to random bytes. */
export const newId = (): string => {
  const c = globalThis.crypto as Crypto & { randomUUID?: () => string };
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  return [...c.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
};
