import type { RawReference, ReferenceCheck } from '@/core/contracts';
import { registries } from '@/core/registries';
import { checkReference } from '@/core/verify/verdict';
import { CORPUS_MANIFEST, LAB_CORPUS, type LabCase } from './corpus';

export type LabRowState = 'unrun' | 'active' | 'completed' | 'cancelled' | 'error';
export interface LabRow {
  case: LabCase;
  state: LabRowState;
  startedAt?: string;
  finishedAt?: string;
  check?: ReferenceCheck;
  error?: string;
  /** Recorded replay evidence only; never inferred from a live registry failure. */
  missingReplay?: string[];
}
export interface LabRun {
  id: string;
  mode: 'live' | 'sample';
  corpusVersion: string;
  status: 'running' | 'completed' | 'cancelled';
  startedAt: string;
  finishedAt?: string;
  rows: readonly LabRow[];
}
export interface LabRunOptions {
  cases?: readonly LabCase[];
  check?: (reference: RawReference) => Promise<ReferenceCheck>;
  onUpdate?: (run: LabRun) => void;
  now?: () => string;
  mode?: LabRun['mode'];
}
export interface LabRunHandle {
  snapshot(): LabRun;
  done: Promise<LabRun>;
  cancel(): void;
}

/** These snapshots contain JSON data only. Copy before freezing to avoid freezing a caller's objects. */
export function immutable<T>(value: T): T {
  const copy = JSON.parse(JSON.stringify(value)) as T;
  const freeze = (item: unknown): void => {
    if (!item || typeof item !== 'object') return;
    Object.values(item).forEach(freeze);
    Object.freeze(item);
  };
  freeze(copy);
  return copy;
}

let sequence = 0;

/** One case at a time. Cancellation cannot abort the shared checker's existing network requests. */
export function startLabRun(options: LabRunOptions = {}): LabRunHandle {
  const now = options.now ?? (() => new Date().toISOString());
  const check = options.check ?? ((ref: RawReference) => checkReference(ref, registries));
  const startedAt = now();
  let stopped = false;
  let current: LabRun = immutable({
    id: `lab-${++sequence}-${startedAt}`,
    mode: options.mode ?? 'live',
    corpusVersion: CORPUS_MANIFEST.version,
    status: 'running',
    startedAt,
    rows: (options.cases ?? LAB_CORPUS).map((c) => ({ case: c, state: 'unrun' })),
  });
  let resolveDone!: (run: LabRun) => void;
  const done = new Promise<LabRun>((resolve) => { resolveDone = resolve; });
  const publish = (next: LabRun): void => {
    current = immutable(next);
    options.onUpdate?.(current);
  };
  const updateRow = (index: number, change: Partial<LabRow>): void => {
    publish({ ...current, rows: current.rows.map((r, i) => i === index ? { ...r, ...change } : r) });
  };
  const handle: LabRunHandle = {
    snapshot: () => current,
    done,
    cancel: () => {
      if (current.status !== 'running') return;
      stopped = true;
      const finishedAt = now();
      publish({ ...current, status: 'cancelled', finishedAt, rows: current.rows.map((r) => r.state === 'active' ? { ...r, state: 'cancelled', finishedAt } : r) });
      resolveDone(current);
    },
  };

  options.onUpdate?.(current);
  void (async () => {
    for (let i = 0; i < current.rows.length; i++) {
      if (stopped) return;
      updateRow(i, { state: 'active', startedAt: now() });
      try {
        // A checker cannot mutate the preserved input snapshot.
        const input = JSON.parse(JSON.stringify(current.rows[i]!.case.reference)) as RawReference;
        const result = await check(input);
        if (stopped) return;
        updateRow(i, { state: 'completed', finishedAt: now(), check: result });
      } catch (error) {
        if (stopped) return;
        // An exception is run data, not a manufactured ReferenceCheck.
        updateRow(i, { state: 'error', finishedAt: now(), error: error instanceof Error ? error.message.slice(0, 300) : 'The checker stopped without returning a result.' });
      }
    }
    if (stopped) return;
    publish({ ...current, status: 'completed', finishedAt: now() });
    resolveDone(current);
  })();
  return handle;
}
