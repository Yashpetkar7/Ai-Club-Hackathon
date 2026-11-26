/**
 * One worker for both on-device models (support and meaning), so the page pays for one runtime, not two.
 * support.ts and core/semantic/meaning.ts talk to it through here. Each says when it needs the worker and
 * when it is done; the worker is closed when neither needs it, which gives the memory back.
 */
export type Model = 'nli' | 'embed';
export type HostMessage = { type: string; [k: string]: any };

let worker: Worker | null = null;
let id = 1;
const users = new Set<Model>();
const listeners = new Set<(m: HostMessage) => void>();

const emit = (m: HostMessage): void => {
  for (const l of [...listeners]) l(m);
};

/** Request ids are shared by both models, so an answer can never reach the wrong one. */
export const nextId = (): number => id++;

export function listen(fn: (m: HostMessage) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function close(): void {
  worker?.terminate();
  worker = null;
  users.clear();
}

/** Opens the worker if it is not open. False when this browser cannot run one. */
export function start(who: Model): boolean {
  if (!worker) {
    try {
      worker = new Worker(new URL('./support.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      return false;
    }
    worker.onmessage = (e: MessageEvent<HostMessage>) => emit(e.data);
    worker.onerror = () => {
      close();
      emit({ type: 'crashed' });
    };
  }
  users.add(who);
  return true;
}

export function send(m: HostMessage, transfer: Transferable[] = []): boolean {
  if (!worker) return false;
  worker.postMessage(m, transfer);
  return true;
}

/**
 * Closes the worker now. It is the only way to stop a download, so the other model goes too;
 * the listeners hear who stopped it and may load theirs again from the browser's cache.
 */
export function stop(by: Model): void {
  if (!worker) return;
  close();
  emit({ type: 'stopped', by });
}

/** This model is no longer needed. The worker closes when nothing else needs it. */
export function release(who: Model): void {
  if (!worker) return;
  users.delete(who);
  if (!users.size) close();
  else send({ type: 'unload', model: who });
}
