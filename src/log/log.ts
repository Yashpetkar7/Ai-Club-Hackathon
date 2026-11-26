import type { Actor, LogEvent } from '@/core/contracts';
import { db } from '@/store/db';
import { GENESIS, hashOf } from './chain';
export { GENESIS, hashOf, verifyChain } from './chain';

/**
 * Append-only record of who did what. Each entry carries the hash of the one before it,
 * so edits inside the available chain can be detected. A removed tail or a rebuilt
 * chain can go undetected without an external anchor: tamper-evident, not tamper-proof.
 */
type Body = Omit<LogEvent, 'seq' | 'hash'>;

let queue: Promise<unknown> = Promise.resolve();

export function record(projectId: string, actor: Actor, action: string, detail: string, extra: { model?: string; prompt?: string } = {}): Promise<LogEvent> {
  const job = queue.then(async () => {
    const all = await db.log.where('projectId').equals(projectId).sortBy('seq');
    const body: Body = { projectId, at: new Date().toISOString(), actor, action, detail, prevHash: all[all.length - 1]?.hash ?? GENESIS, ...extra };
    const entry = { ...body, hash: await hashOf(body) };
    const seq = await db.log.add(entry as LogEvent);
    return { ...entry, seq: Number(seq) } as LogEvent;
  });
  queue = job.catch(() => undefined);
  return job;
}

