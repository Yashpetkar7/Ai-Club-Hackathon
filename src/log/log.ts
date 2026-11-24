import type { Actor, LogEvent } from '@/core/contracts';
import { db } from '@/store/db';

/**
 * Append-only record of who did what. Each entry carries the hash of the one before it,
 * so an edited or deleted entry is visible. Tamper-evident, not tamper-proof: someone with
 * the whole log could rebuild it, and we say so.
 */
export const GENESIS = '0'.repeat(64);

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type Body = Omit<LogEvent, 'seq' | 'hash'>;

export const hashOf = (e: Body): Promise<string> => sha256(JSON.stringify([e.projectId, e.at, e.actor, e.action, e.detail, e.model ?? '', e.prompt ?? '', e.prevHash]));

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

export async function verifyChain(events: LogEvent[]): Promise<{ ok: true; count: number } | { ok: false; brokenAt: number; count: number }> {
  let prev = GENESIS;
  for (const [i, e] of events.entries()) {
    const { seq: _seq, hash, ...body } = e;
    if (e.prevHash !== prev || (await hashOf(body)) !== hash) return { ok: false, brokenAt: i + 1, count: events.length };
    prev = hash;
  }
  return { ok: true, count: events.length };
}
