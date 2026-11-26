import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from '@/app/router';
import { onSupport, supportState, type SupportState } from '@/core/claims/support';
import { askAiKey, LICENCES_CHECKED_ON, MODELS, PROXY_HOSTS, taskRows, type AiKey, type ModelFacts } from '@/core/guardrails/architecture';
import { GUARDRAILS, runGuardrails, type CaseResult, type GuardrailCheck, type GuardrailResult } from '@/core/guardrails/checks';
import { MAPPING, NIST, OWASP, UNESCO } from '@/core/guardrails/frameworks';
import { loadBenchmark, type Benchmark } from '@/core/lab/benchmark';
import type { Rate } from '@/core/lab/metrics';
import { meaningState, onMeaning, type MeaningState } from '@/core/semantic/meaning';
import { Stamp } from '@/ui/Stamp';
import css from './Guardrails.module.css';

/**
 * Every guardrail the deck promises, run live on the real code, then what runs where, the two model cards and
 * our own mapping to published frameworks. Nothing runs until the button is pressed. The checks themselves live
 * in src/core/guardrails, so the unit tests run the same list.
 */

type Run =
  | { status: 'idle' }
  | { status: 'running'; results: GuardrailResult[] }
  | { status: 'stopped'; results: GuardrailResult[] }
  | { status: 'done'; results: GuardrailResult[]; at: string };

const N = GUARDRAILS.length;

function statusLine(run: Run): string {
  if (run.status === 'idle') return `Nothing has run yet. ${N} checks are ready.`;
  const r = run.results;
  const pass = r.filter((x) => x.outcome === 'pass').length;
  const fail = r.filter((x) => x.outcome === 'fail').length;
  const cnr = r.filter((x) => x.outcome === 'could-not-run').length;
  if (run.status === 'running') return `Running check ${Math.min(r.length + 1, N)} of ${N}: ${GUARDRAILS[r.length]?.guardrail ?? 'finishing'}.`;
  if (run.status === 'stopped') return `Partly done: stopped after ${r.length} of ${N} checks. ${pass} match what the deck says.`;
  if (fail) return `${fail} of ${N} checks do not match what the deck says. ${pass} match${cnr ? `, and ${cnr} could not run` : ''}.`;
  if (cnr) return `Partly done: ${pass} of ${N} checks match what the deck says. ${cnr} could not run.`;
  return `All ${N} checks match what the deck says.`;
}

function CaseStamp({ r }: { r: CaseResult | undefined }) {
  if (!r) return <Stamp tone="mute" mark="~">Not run yet</Stamp>;
  if (r.outcome === 'could-not-run') return <Stamp tone="mute" mark="…">Could not run</Stamp>;
  if (r.outcome === 'fail') return <Stamp tone="bad" mark="✕">Does not match</Stamp>;
  if (r.limit) return <Stamp tone="mute" mark="!">The stated limit</Stamp>;
  return <Stamp tone="ok" mark="✓">Matches</Stamp>;
}

function RowStamp({ r, running }: { r: GuardrailResult | undefined; running: boolean }) {
  if (running) return <Stamp tone="mute" mark="…">Running</Stamp>;
  if (!r) return <Stamp tone="mute" mark="~">Not run yet</Stamp>;
  if (r.outcome === 'pass') return <Stamp tone="ok" mark="✓" land>Matches the deck</Stamp>;
  if (r.outcome === 'fail') return <Stamp tone="bad" mark="✕" land>Does not match the deck</Stamp>;
  return <Stamp tone="mute" mark="…">Could not run</Stamp>;
}

function CheckRow({ check, result, running }: { check: GuardrailCheck; result: GuardrailResult | undefined; running: boolean }) {
  const id = `guard-${check.id}`;
  return (
    <li className={`card ${css.row}`} data-outcome={result?.outcome ?? (running ? 'running' : 'idle')}>
      <div className={css.head}>
        <h3 id={id}>{check.guardrail}</h3>
        <RowStamp r={result} running={running} />
      </div>
      <dl className={css.facts}>
        <div><dt>Risk</dt><dd>{check.risk}</dd></div>
        <div><dt>The deck, slide {check.slide}</dt><dd>{check.promise}</dd></div>
        <div><dt><span className="sample">SAMPLE</span> input</dt><dd>{check.sample}</dd></div>
      </dl>
      <ul className={css.cases} aria-label={`${check.guardrail}: cases`}>
        {check.cases.map((spec, i) => {
          const r = result?.cases[i];
          return (
            <li key={spec.input} className={css.case} data-outcome={r?.outcome ?? 'idle'}>
              <p className={css.input}>{spec.input}</p>
              <dl className={css.pair}>
                <div><dt>Expected</dt><dd>{spec.expected}</dd></div>
                <div><dt>Worked out now</dt><dd>{r ? r.actual : 'Not run yet'}</dd></div>
              </dl>
              <CaseStamp r={r} />
              {r?.detail && (
                <details className={css.more}>
                  <summary>What the code returned</summary>
                  <p>{r.detail}</p>
                </details>
              )}
            </li>
          );
        })}
      </ul>
      {check.limit && <p className={css.limit}><strong>Limit.</strong> {check.limit}</p>}
      {result?.error && <p className={css.error}>This check could not run: {result.error}</p>}
      <p className={css.where}>
        Code: {check.where.map((w, i) => <span key={w}>{i > 0 && '; '}<code>{w}</code></span>)}
      </p>
    </li>
  );
}

function RunLive({ online }: { online: boolean }) {
  const [run, setRun] = useState<Run>({ status: 'idle' });
  const gen = useRef(0);
  useEffect(() => () => { gen.current++; }, []);

  const start = () => {
    const mine = ++gen.current;
    setRun({ status: 'running', results: [] });
    const env = { fetch: (input: RequestInfo | URL, init?: RequestInit) => window.fetch(input, init) };
    void runGuardrails(env, (r) => {
      if (gen.current === mine) setRun((prev) => (prev.status === 'running' ? { status: 'running', results: [...prev.results, r] } : prev));
    }, () => gen.current !== mine).then((all) => {
      if (gen.current === mine) setRun({ status: 'done', results: all, at: new Date().toISOString() });
    });
  };
  const stop = () => {
    gen.current++;
    setRun((prev) => (prev.status === 'running' ? { status: 'stopped', results: prev.results } : prev));
  };

  const results = run.status === 'idle' ? [] : run.results;
  const byId = new Map(results.map((r) => [r.id, r]));
  const running = run.status === 'running';
  return (
    <section className="stack" aria-labelledby="guard-live-heading">
      <h2 id="guard-live-heading">Guardrails, run live</h2>
      <p>Each row is a promise from our deck. Pressing the button runs the real function on a SAMPLE input built from data already in this app, then compares what it returns with what the deck says. A row turns green only when the two are the same. A check that cannot run says so; it is never counted as a pass.</p>
      {!online && <p className={css.note}>You are offline. Every check runs in this browser except the server check, which will say Could not run.</p>}
      <div className="row">
        <button className="btn main" type="button" onClick={running ? stop : start}>{running ? 'Stop' : run.status === 'idle' ? 'Run every check' : 'Run every check again'}</button>
        {run.status === 'done' && <span className="soft">Worked out <time dateTime={run.at}>{new Date(run.at).toLocaleTimeString()}</time>, in this browser.</span>}
      </div>
      <p className={css.status} role="status" aria-live="polite" aria-atomic="true">{statusLine(run)}</p>
      <ul className={css.rows} aria-label="Guardrails">
        {GUARDRAILS.map((check, i) => <CheckRow key={check.id} check={check} result={byId.get(check.id)} running={running && i === results.length} />)}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------- what runs where */

const stateText = (s: SupportState | MeaningState): string => (s.status === 'ready' ? 'Loaded in this browser' : s.status === 'loading' ? 'Loading now' : s.status === 'failed' ? 'Did not load' : 'Not loaded');

const KEY_TEXT: Record<AiKey | 'asking', string> = {
  asking: 'Asking this site’s server…',
  yes: 'Yes. This site’s server holds a key, so AI tasks can run at a level that allows them. The key never reaches the page.',
  no: 'No. This site’s server holds no AI key, so every AI task says it is unavailable. Everything else works.',
  'no-server': 'No server answered. On a static copy of the site there is no AI gateway, so no AI task can run.',
};

function Licence({ m }: { m: ModelFacts }) {
  return (
    <details className={css.more}>
      <summary>{m.licence.short}</summary>
      <div className="stack">
        <p>{m.licence.text}</p>
        <ul className={css.links}>
          {m.licence.checked.map((c) => <li key={c.url}><a href={c.url} target="_blank" rel="noreferrer">{c.label}</a></li>)}
        </ul>
        <p className="soft">Looked up on {LICENCES_CHECKED_ON}.</p>
      </div>
    </details>
  );
}

function WhereItRuns() {
  const support = useSyncExternalStore(onSupport, supportState);
  const meaning = useSyncExternalStore(onMeaning, meaningState);
  const [key, setKey] = useState<AiKey | 'asking'>('asking');
  useEffect(() => {
    let on = true;
    void askAiKey().then((k) => { if (on) setKey(k); });
    return () => { on = false; };
  }, []);
  const now = { support, meaning };
  const tasks = taskRows();
  return (
    <section className="stack" aria-labelledby="guard-where-heading">
      <h2 id="guard-where-heading">What runs where</h2>
      <p className="soft">Read from the code that runs this page. Two values live only on the server, so this page keeps a copy and a unit test fails if the copy and the server file ever differ.</p>

      <div className={`stack ${css.block}`}>
        <h3>In this browser</h3>
        <p>Every check above, the reference checker, the claim checks and the evidence log. Plain code, no AI. The library is worked on here.</p>
        <div className={css.scroll} role="region" aria-labelledby="guard-models-caption" tabIndex={0}>
          <table className={css.table}>
            <caption id="guard-models-caption">On-device models</caption>
            <thead><tr><th scope="col">Model</th><th scope="col">Files from Hugging Face</th><th scope="col">Revision</th><th scope="col">Size</th><th scope="col">Licence</th><th scope="col">Now</th></tr></thead>
            <tbody>
              {MODELS.map((m) => (
                <tr key={m.key}>
                  <th scope="row">{m.name}</th>
                  <td><code>{m.repo}</code></td>
                  <td>{m.revision ? <code>{m.revision}</code> : 'Not pinned: the newest files load'}</td>
                  <td>About {m.mb} MB</td>
                  <td><Licence m={m} /></td>
                  <td>{stateText(now[m.key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`stack ${css.block}`}>
        <h3>On this site’s server</h3>
        <p>The registry proxy forwards lookups to these hosts only: {PROXY_HOSTS.map((h, i) => <span key={h}>{i > 0 && ', '}<code>{h}</code></span>)}.</p>
        <p>The AI gateway runs fixed tasks only. There is no open prompt. Each task needs at least this level, checked by the server and by the page:</p>
        <div className={css.scroll} role="region" aria-labelledby="guard-tasks-caption" tabIndex={0}>
          <table className={css.table}>
            <caption id="guard-tasks-caption">AI tasks and the lowest level for each</caption>
            <thead><tr><th scope="col">Task</th><th scope="col">What it does</th><th scope="col">Agent</th><th scope="col">Server needs</th><th scope="col">Page needs</th></tr></thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.task}>
                  <th scope="row"><code>{t.task}</code></th>
                  <td>{t.does}</td>
                  <td>{t.agent}</td>
                  <td>Level {t.server}</td>
                  <td>{t.page === null ? 'No agent' : `Level ${t.page}`}{t.agree ? '' : '. Differs from the server'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p><strong>AI key on this server.</strong> <span role="status">{KEY_TEXT[key]}</span></p>
      </div>

      <div className={`stack ${css.block}`}>
        <h3>Outside</h3>
        <p>The free scholarly registries behind those hosts. An AI service, Groq or Gemini, only when the server holds a key and a student presses an AI button at a level that allows it. The two models download from Hugging Face once, when someone asks for them.</p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- model cards */

const pct = (p: number): string => `${(p * 100).toFixed(1).replace(/\.0$/, '')}%`;
const rate = (r: Rate): string => (r.p === null ? `${r.k} of ${r.n}` : `${r.k} of ${r.n} (${pct(r.p)}; 95% range ${pct(r.lo!)} to ${pct(r.hi!)})`);
const day = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
};

function Measured({ state }: { state: { status: 'loading' } | { status: 'ready'; b: Benchmark } | { status: 'failed'; why: string } }) {
  if (state.status === 'loading') return <p className="soft">Working out the numbers from the Lab’s recorded data…</p>;
  if (state.status === 'failed') return <p className={css.error}>{state.why}</p>;
  const { claims, data } = state.b;
  const m = claims.main.metrics;
  const pv = data.payload.provenance;
  return (
    <div className="stack">
      <ul className={css.figures}>
        <li><strong>False claims labelled Verified:</strong> {rate(m.falseVerified)}. The claim checker with this model’s recorded scores, as the product runs.</li>
        <li><strong>True claims labelled Verified:</strong> {rate(m.trueVerified)}.</li>
        {claims.model.auc !== null && <li><strong>Area under the ROC curve</strong> for the support score alone: {claims.model.auc.toFixed(3)}. 1 means every true claim scores above every false one.</li>}
      </ul>
      <p className={css.note}><span className="sample">SAMPLE</span> Worked out just now from recorded data. The team wrote these {m.total} claims against {pv.counts.abstracts} real abstracts. It is a development set: the claim rules were tuned on it, so these are not hold-out results. The scores were recorded once, on {day(pv.recordedAt)}, with {pv.model}.</p>
      <p><Link to="/lab?misses">See every miss in the Integrity Lab</Link></p>
    </div>
  );
}

function ModelCards() {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; b: Benchmark } | { status: 'failed'; why: string }>({ status: 'loading' });
  useEffect(() => {
    let on = true;
    loadBenchmark()
      .then((b) => { if (on) setState({ status: 'ready', b }); })
      .catch((e: unknown) => { if (on) setState({ status: 'failed', why: e instanceof Error ? e.message : 'The numbers could not be worked out.' }); });
    return () => { on = false; };
  }, []);
  const support = MODELS.find((m) => m.key === 'support')!;
  const meaning = MODELS.find((m) => m.key === 'meaning')!;
  return (
    <section className="stack" aria-labelledby="guard-cards-heading" aria-busy={state.status === 'loading'}>
      <h2 id="guard-cards-heading">Model cards</h2>
      <div className={css.cards}>
        <article className={`card ${css.modelCard}`} aria-labelledby="guard-card-support">
          <h3 id="guard-card-support">{support.name}</h3>
          <dl className={css.facts}>
            <div><dt>What it does here</dt><dd>Scores how one source sentence relates to a claim: supports it, says neither, or contradicts it.</dd></div>
            <div><dt>What it never does</dt><dd>Decide a label. <code>judge()</code> in <code>src/core/claims/label.ts</code> does, and a high score never makes a claim Verified unless the sentence is in the source, two registries confirmed it and every plain-code check passes.</dd></div>
            <div><dt>Where it runs</dt><dd>In this browser, in a background worker, with ONNX Runtime. Claims and sources are not sent anywhere.</dd></div>
            <div><dt>Size</dt><dd>About {support.mb} MB, downloaded once when someone asks for it. <code>{support.repo}</code>.</dd></div>
            <div><dt>Measured</dt><dd><Measured state={state} /></dd></div>
          </dl>
        </article>
        <article className={`card ${css.modelCard}`} aria-labelledby="guard-card-meaning">
          <h3 id="guard-card-meaning">{meaning.name}</h3>
          <dl className={css.facts}>
            <div><dt>What it does here</dt><dd>Turns sentences into numbers so the sentences closest in meaning to a claim can be shown first.</dd></div>
            <div><dt>What it never does</dt><dd>Decide a label or give a score that counts towards one. It only puts sentences in order; <code>judge()</code> decides.</dd></div>
            <div><dt>Where it runs</dt><dd>In this browser, in the same background worker. Nothing is sent anywhere.</dd></div>
            <div><dt>Size</dt><dd>About {meaning.mb} MB, pinned to one revision. <code>{meaning.repo}</code>.</dd></div>
            <div><dt>Measured</dt><dd>No recorded numbers. The Integrity Lab measures it on your device when you ask, in “Finding the sentence: by words or by meaning”. <Link to="/lab">Open the Integrity Lab</Link></dd></div>
          </dl>
        </article>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- frameworks */

function Frameworks() {
  return (
    <section className="stack" aria-labelledby="guard-frameworks-heading">
      <h2 id="guard-frameworks-heading">How this maps to published frameworks</h2>
      <p className={css.claim}><strong>Our own mapping. Not a certification, audit or compliance claim.</strong></p>
      <p className="soft">{NIST.revision} Only entries whose titles we opened and confirmed are used.</p>
      <div className={css.scroll} role="region" aria-labelledby="guard-map-caption" tabIndex={0}>
        <table className={`${css.table} ${css.wide}`}>
          <caption id="guard-map-caption">Our controls next to three frameworks</caption>
          <thead><tr><th scope="col">Our control</th><th scope="col">NIST AI RMF 1.0 function</th><th scope="col">OWASP Top 10 for LLM Applications 2025</th><th scope="col">UNESCO 2023 guidance</th><th scope="col">See it</th></tr></thead>
          <tbody>
            {MAPPING.map((row) => (
              <tr key={row.control}>
                <th scope="row">{row.control}</th>
                <td>{row.nist.join(', ')}</td>
                <td>{row.owasp.length ? row.owasp.map((o, i) => <span key={o.id}>{i > 0 && '; '}<a href={o.url} target="_blank" rel="noreferrer">{o.id}:2025 {o.title}</a></span>) : 'Not mapped'}</td>
                <td>{row.unesco.length ? row.unesco.join('; ') : 'Not mapped'}</td>
                <td>{row.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className={css.links} aria-label="Framework sources">
        <li><a href={NIST.core} target="_blank" rel="noreferrer">{NIST.name}: the core and its four functions</a></li>
        <li><a href={NIST.home} target="_blank" rel="noreferrer">NIST’s AI RMF page, with the revision notice</a></li>
        <li><a href={OWASP.home} target="_blank" rel="noreferrer">{OWASP.name}</a></li>
        <li><a href={UNESCO.home} target="_blank" rel="noreferrer">{UNESCO.name}</a></li>
      </ul>
    </section>
  );
}

export function Guardrails() {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const changed = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', changed);
    window.addEventListener('offline', changed);
    return () => {
      window.removeEventListener('online', changed);
      window.removeEventListener('offline', changed);
    };
  }, []);
  return (
    <main className="wrap page" id="main" tabIndex={-1}>
      <div className="stack">
        <h1>Guardrails</h1>
        <p className="soft">Every guardrail our deck promises, shown working on the real code. Nothing here is typed-in proof: the results are worked out in your browser when you ask.</p>
        <p className={css.see}>
          The rules themselves are in <Link to="/rules">House rules</Link>. How accurate the checks are, with every miss, is in the <Link to="/lab">Integrity Lab</Link>.
        </p>
      </div>
      <RunLive online={online} />
      <WhereItRuns />
      <ModelCards />
      <Frameworks />
    </main>
  );
}
