import type { LogEvent } from '@/core/contracts';

export const GENESIS = '0'.repeat(64);
type Body = Omit<LogEvent, 'seq' | 'hash'>;
export async function hashOf(e: Body): Promise<string> {
  const text = JSON.stringify([e.projectId, e.at, e.actor, e.action, e.detail, e.model ?? '', e.prompt ?? '', e.prevHash]);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Checks internal consistency only. A removed tail or a rebuilt chain needs an external anchor to detect. */
export async function verifyChain(events: LogEvent[]): Promise<{ ok: true; count: number } | { ok: false; brokenAt: number; count: number }> {
  let prev = GENESIS;
  let seq = 0;
  const projectId = events[0]?.projectId;
  for (const [i, e] of events.entries()) {
    const { seq: current, hash, ...body } = e;
    if (e.projectId !== projectId || !Number.isSafeInteger(current) || current <= seq || e.prevHash !== prev || (await hashOf(body)) !== hash) return { ok: false, brokenAt: i + 1, count: events.length };
    prev = hash;
    seq = current;
  }
  return { ok: true, count: events.length };
}
