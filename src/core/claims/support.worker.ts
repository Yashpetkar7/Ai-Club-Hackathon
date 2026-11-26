/// <reference lib="webworker" />
import { AutoModelForSequenceClassification, AutoTokenizer, env, pipeline } from '@huggingface/transformers';
import { MEANING_MODEL, MEANING_REVISION } from '@/core/semantic/models';
import { threeWay } from './nli';

/**
 * Runs the on-device models: the support model, which scores a claim against one sentence, and the meaning
 * model, which turns sentences into vectors for ranking. One worker holds both, so they share one runtime.
 * Each loads only when first asked for. Neither writes text.
 *
 * In:  load | score {id, premise, hypothesis} | load-embed | embed {id, texts} | unload {model}
 * Out: progress | ready | score {id, entails, neutral, contradicts} | error {id?, message}
 *      embed-progress | embed-ready | embedded {id, dims, data} | embed-error {message}
 */
const MODEL = 'Xenova/nli-deberta-v3-xsmall';
env.allowLocalModels = false;

type Loaded = { tokenizer: any; model: any };
type Progress = (p: any) => void;
let ready: Promise<Loaded> | null = null;
let embedder: Promise<any> | null = null;

/** Adds up the progress of every file, so the page shows one bar. */
function progressOf(type: 'progress' | 'embed-progress'): Progress {
  const files = new Map<string, { loaded: number; total: number }>();
  return (p: any) => {
    if (p.status !== 'progress' || !p.total) return;
    files.set(p.file, { loaded: p.loaded, total: p.total });
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    postMessage({ type, loaded, total });
  };
}

function load(): Promise<Loaded> {
  ready ??= (async () => {
    const progress_callback = progressOf('progress');
    const tokenizer = await AutoTokenizer.from_pretrained(MODEL, { progress_callback });
    const model = await AutoModelForSequenceClassification.from_pretrained(MODEL, { dtype: 'q8', device: 'wasm', progress_callback });
    return { tokenizer, model };
  })();
  ready.catch(() => {
    ready = null;
  });
  return ready;
}

function loadEmbedder(): Promise<any> {
  embedder ??= pipeline('feature-extraction', MEANING_MODEL, { revision: MEANING_REVISION, dtype: 'q8', device: 'wasm', progress_callback: progressOf('embed-progress') });
  embedder.catch(() => {
    embedder = null;
  });
  return embedder;
}

// One model run at a time. Downloads may overlap; runs on the shared runtime do not.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
}

async function score(premise: string, hypothesis: string) {
  const { tokenizer, model } = await load();
  return serial(async () => {
    const inputs = await tokenizer(premise, { text_pair: hypothesis, truncation: true });
    const { logits } = await model(inputs);
    return threeWay(logits.data as Float32Array, model.config.id2label as Record<string, string>);
  });
}

async function embed(texts: string[]): Promise<{ dims: number; data: Float32Array }> {
  const extractor = await loadEmbedder();
  return serial(async () => {
    const out = await extractor(texts, { pooling: 'cls', normalize: true });
    return { dims: Number(out.dims.at(-1)), data: new Float32Array(out.data as Float32Array) };
  });
}

async function unload(which: 'nli' | 'embed'): Promise<void> {
  const held = which === 'nli' ? ready : embedder;
  if (which === 'nli') ready = null;
  else embedder = null;
  const m = await held?.catch(() => null);
  await (which === 'nli' ? m?.model : m)?.dispose?.();
}

type In =
  | { type: 'load' }
  | { type: 'score'; id: number; premise: string; hypothesis: string }
  | { type: 'load-embed' }
  | { type: 'embed'; id: number; texts: string[] }
  | { type: 'unload'; model: 'nli' | 'embed' };

const why = (err: unknown): string => (err instanceof Error ? err.message : String(err));

onmessage = async (e: MessageEvent<In>) => {
  const m = e.data;
  if (m.type === 'load-embed') {
    try {
      await loadEmbedder();
      postMessage({ type: 'embed-ready' });
    } catch (err) {
      postMessage({ type: 'embed-error', message: why(err) });
    }
    return;
  }
  if (m.type === 'embed') {
    try {
      const { dims, data } = await embed(m.texts);
      postMessage({ type: 'embedded', id: m.id, dims, data }, { transfer: [data.buffer] });
    } catch (err) {
      postMessage({ type: 'error', id: m.id, message: why(err) });
    }
    return;
  }
  if (m.type === 'unload') {
    await unload(m.model).catch(() => undefined);
    return;
  }
  try {
    if (m.type === 'load') {
      await load();
      postMessage({ type: 'ready' });
    } else postMessage({ type: 'score', id: m.id, ...(await score(m.premise, m.hypothesis)) });
  } catch (err) {
    postMessage({ type: 'error', id: m.type === 'score' ? m.id : undefined, message: why(err) });
  }
};
