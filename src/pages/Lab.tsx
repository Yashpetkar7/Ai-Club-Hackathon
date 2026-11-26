import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cancelSupport, loadSupport, onSupport, scoreSupport, SUPPORT_MB, supportState } from '@/core/claims/support';
import { CLAIM_TEXT, REASON_TEXT } from '@/core/contracts';
import { loadBenchmark, type Benchmark } from '@/core/lab/benchmark';
import { CLAIM_SETS, type ClaimsEval } from '@/core/lab/claims-data';
import { CORPUS_MANIFEST, LAB_CORPUS, type LabExpectation } from '@/core/lab/corpus';
import { evaluateCase, FAMILY_LABELS, isKnownVerdict, summarizeFamilies } from '@/core/lab/evaluate';
import type { ClaimMiss, MissKind, Rate, SweepPoint } from '@/core/lab/metrics';
import { compareRetrieval, type RetrievalSummary } from '@/core/lab/retrieval';
import { startLabRun, type LabRow, type LabRun, type LabRunHandle } from '@/core/lab/runner';
import { loadSample, type RecordedSample } from '@/core/lab/sample';
import { cancelMeaning, embedder, loadMeaning, meaningState, onMeaning } from '@/core/semantic/meaning';
import { MEANING_MB } from '@/core/semantic/models';
import { VerdictStamp } from '@/ui/Stamp';
import css from './Lab.module.css';

const INITIAL_ROWS: readonly LabRow[] = LAB_CORPUS.map((item) => ({ case: item, state: 'unrun' }));
const EXPECTED: Record<LabExpectation, string> = {
  'metadata-match': 'The recorded real metadata should match.',
  'retraction-flag': 'The known retraction should be flagged.',
  'reject-invented': 'The invented input should not be confirmed.',
};

function Time({ value }: { value: string }) {
  const date = new Date(value);
  return <time dateTime={value}>{Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { timeZoneName: 'short' })}</time>;
}

function CaseResult({ row, sample }: { row: LabRow; sample: boolean }) {
  const evaluation = evaluateCase(row);
  const check = row.check;
  return (
    <li className={`card ${css.case}`} data-outcome={evaluation.outcome}>
      <div className="row">
        {sample && <span className={css.sample}>SAMPLE</span>}
        <span className={row.case.invented ? css.invented : 'soft'}>{row.case.label}</span>
        <span className="soft">{FAMILY_LABELS[row.case.family]}</span>
      </div>
      <h3>{row.case.title}</h3>
      <p className={css.reference}>{row.case.reference.raw}</p>
      <p className="soft">Expected: {EXPECTED[row.case.expected]}</p>
      <div className="row">
        {check && isKnownVerdict(check.verdict) && <VerdictStamp verdict={check.verdict} />}
        {check && !isKnownVerdict(check.verdict) && <span className={css.neutral}>Checker value: {String(check.verdict)}</span>}
        <strong>{evaluation.text}</strong>
      </div>
      {evaluation.limitedCoverage && <p className={css.coverage}>Limited registry coverage. This flag overlaps the outcome above; it is not an additional case.</p>}
      {row.error && <p className={css.error}>{row.error}</p>}
      {row.missingReplay && row.missingReplay.length > 0 && <p className={css.coverage}>Missing replay coverage concerns unrecorded request URLs, not an observed live registry outage.</p>}
      {check?.checkedAt && <p className="soft">{sample ? 'Checker ran in replay: ' : 'Checker ran: '}<Time value={check.checkedAt} />{sample ? '. Only retry delays were simulated.' : '.'}</p>}
      <details className={css.details}>
        <summary>Check trace and provenance</summary>
        <div className="stack">
          <p>{row.case.explanation}</p>
          {check ? (
            <>
              {check.reasons.length > 0 && <ul>{check.reasons.map((reason, index) => <li key={`${reason}-${index}`}>{Object.hasOwn(REASON_TEXT, reason) ? REASON_TEXT[reason] : String(reason)}</li>)}</ul>}
              {check.fields.length > 0 && (
                <dl className={css.comparison} aria-label="Compared fields">
                  {check.fields.map((field, index) => (
                    <div key={`${field.field}-${index}`}>
                      <dt>{field.field.charAt(0).toUpperCase() + field.field.slice(1)} · {field.ok ? 'Matched' : 'Different'}</dt>
                      <dd><strong>Given:</strong> {field.given}</dd>
                      <dd><strong>Registry:</strong> {field.registry}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {check.trace.length > 0 ? (
                <ul aria-label="Registry trace">
                  {check.trace.map((entry, index) => (
                    <li key={`${entry.registry}-${index}`}>
                      <strong>{entry.registry}</strong>: {entry.status}{entry.note ? ` — ${entry.note}` : ''}
                    </li>
                  ))}
                </ul>
              ) : <p className="soft">The checker returned no registry lookup trace for this case.</p>}
              {check.record && <p className={css.reference}>Returned record: {check.record.title}{check.record.doi ? ` · DOI ${check.record.doi}` : ''}</p>}
            </>
          ) : <p className="soft">No checker verdict has been returned for this case.</p>}
          {!!row.missingReplay?.length && (
            <div className="stack">
              <h4>Unrecorded replay requests</h4>
              <ul>{row.missingReplay.map((url) => <li key={url} className="mono">{url}</li>)}</ul>
            </div>
          )}
          {row.case.provenance.length > 0 ? (
            <ul aria-label="Input provenance">
              {row.case.provenance.map((source, index) => (
                <li key={`${source.doi}-${index}`}>
                  <a href={source.fixtureUrl} target="_blank" rel="noreferrer">Original Crossref request for {source.doi}</a>
                  <span className="soft"> · {source.itemIndex === null ? 'direct record' : `search result at index ${source.itemIndex}`}</span>
                </li>
              ))}
            </ul>
          ) : <p className="soft">This placeholder is generated by the Lab; it has no source record.</p>}
          {row.case.provenance.length > 0 && <p className="soft">Input provenance comes from a captured metadata excerpt. Opening a request link may return newer registry data.</p>}
        </div>
      </details>
    </li>
  );
}

/* ---------------------------------------------------------------- How accurate is it? */

const pct = (p: number): string => `${(p * 100).toFixed(1).replace(/\.0$/, '')}%`;
const ofN = (r: Rate): string => `${r.k} of ${r.n}`;
const range = (r: Rate): string => (r.p === null ? 'No cases to measure.' : `${pct(r.p)}; 95% range ${pct(r.lo!)} to ${pct(r.hi!)}`);
const day = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
};
const MISS_TEXT: Record<MissKind, string> = {
  'false-verified': 'False claim labelled Verified',
  'true-disputed': 'True claim labelled Disputed',
  'false-not-disputed': 'False claim not caught',
  'true-not-verified': 'True claim not confirmed',
};
const SET_NAME = Object.fromEntries(CLAIM_SETS.map((s) => [s.id, s.name]));

function Metric({ title, rate, note, bad }: { title: string; rate: Rate; note: string; bad?: boolean }) {
  return (
    <li className={`card ${css.metric}`} data-bad={bad ? 'true' : undefined}>
      <h4>{title}</h4>
      <p className={css.figure}>{ofN(rate)}</p>
      <p className="soft">{range(rate)}</p>
      <p className="soft">{note}</p>
    </li>
  );
}

/** Precision and recall of the support score alone, by threshold. The table under it holds the same numbers. */
function SweepChart({ points, policy }: { points: SweepPoint[]; policy: number }) {
  const W = 360, H = 220, L = 40, R = 66, T = 14, B = 36;
  const x = (t: number) => L + ((t - 0.5) / 0.5) * (W - L - R);
  const y = (v: number) => T + (1 - v) * (H - T - B);
  const line = (key: 'precision' | 'recall') => points.filter((p) => p[key].p !== null).map((p, i) => `${i ? 'L' : 'M'}${x(p.threshold).toFixed(1)},${y(p[key].p!).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const atPolicy = points.find((p) => p.threshold === policy);
  return (
    <figure className={css.figureBox}>
      <svg className={css.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="lab-sweep-title lab-sweep-desc">
        <title id="lab-sweep-title">Precision and recall if the support score alone decided Verified, by threshold</title>
        <desc id="lab-sweep-desc">{atPolicy && atPolicy.precision.p !== null && atPolicy.recall.p !== null ? `At the policy line of ${pct(policy)}, precision ${pct(atPolicy.precision.p)} and recall ${pct(atPolicy.recall.p)}. The table below has every point.` : 'The table below has every point.'}</desc>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line className={css.grid} x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
            <text x={L - 6} y={y(v) + 4} textAnchor="end">{pct(v)}</text>
          </g>
        ))}
        {[0.5, 0.6, 0.7, 0.8, 0.9, 1].map((t) => <text key={t} x={x(t)} y={H - B + 16} textAnchor="middle">{pct(t)}</text>)}
        <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle">Support threshold</text>
        <line className={css.policy} x1={x(policy)} x2={x(policy)} y1={T} y2={H - B} />
        <text x={x(policy) - 5} y={y(0.12)} textAnchor="end">Policy line</text>
        <path className={css.precision} d={line('precision')} />
        <path className={css.recall} d={line('recall')} />
        {points.map((p) => (
          <g key={p.threshold}>
            {p.precision.p !== null && <circle className={css.precisionDot} cx={x(p.threshold)} cy={y(p.precision.p)} r={4}><title>{`Threshold ${pct(p.threshold)}: precision ${pct(p.precision.p)} (${ofN(p.precision)})`}</title></circle>}
            {p.recall.p !== null && <rect className={css.recallDot} x={x(p.threshold) - 4} y={y(p.recall.p) - 4} width={8} height={8}><title>{`Threshold ${pct(p.threshold)}: recall ${pct(p.recall.p)} (${ofN(p.recall)})`}</title></rect>}
          </g>
        ))}
        {last?.precision.p != null && <text x={x(last.threshold) + 8} y={y(last.precision.p) + 4}>Precision</text>}
        {last?.recall.p != null && <text x={x(last.threshold) + 8} y={y(last.recall.p) + 4}>Recall</text>}
      </svg>
      <figcaption>
        <ul className={css.legend} aria-label="Chart key">
          <li><svg className={css.key} viewBox="0 0 24 10" aria-hidden="true"><line className={css.precision} x1={0} x2={24} y1={5} y2={5} /><circle className={css.precisionDot} cx={12} cy={5} r={4} /></svg>Precision: of the claims it would pass, how many are true. Circles.</li>
          <li><svg className={css.key} viewBox="0 0 24 10" aria-hidden="true"><line className={css.recall} x1={0} x2={24} y1={5} y2={5} /><rect className={css.recallDot} x={8} y={1} width={8} height={8} /></svg>Recall: of the true claims, how many it would pass. Squares.</li>
          <li><svg className={css.key} viewBox="0 0 24 10" aria-hidden="true"><line className={css.policy} x1={0} x2={24} y1={5} y2={5} /></svg>The policy line at {pct(policy)}.</li>
        </ul>
      </figcaption>
    </figure>
  );
}

function ClaimMissItem({ m }: { m: ClaimMiss }) {
  const serious = m.kind === 'false-verified' || m.kind === 'true-disputed';
  return (
    <li className={`card ${css.claimMiss}`} data-serious={serious ? 'true' : undefined}>
      <strong>{MISS_TEXT[m.kind]}</strong>
      <p className={css.reference}>{m.claim}</p>
      <p className="soft">{SET_NAME[m.set]}. Label given: {CLAIM_TEXT[m.label].label}.</p>
      {m.reasons.length > 0 && <ul className={css.reasons}>{m.reasons.map((r) => <li key={r}>{REASON_TEXT[r]}</li>)}</ul>}
      {m.passage ? <blockquote className={css.quote}>{m.passage}</blockquote> : <p className="soft">No sentence in the abstract was close enough to compare.</p>}
      <p className="soft">{m.support ? `Recorded support ${pct(m.support.entails)}, contradiction ${pct(m.support.contradicts)}.` : m.scoreFits ? 'No model score was used.' : 'The recorded score belongs to a different sentence, so it was not used.'}</p>
    </li>
  );
}

type RetrievalRun = { status: 'idle' } | { status: 'running'; done: number; total: number } | { status: 'done'; result: RetrievalSummary } | { status: 'cancelled' } | { status: 'failed'; why: string };

/** The live comparison. Nothing loads until the button is pressed; the claims never leave this device. */
function RetrievalCompare({ data, online, threshold }: { data: ClaimsEval; online: boolean; threshold: number }) {
  const meaning = useSyncExternalStore(onMeaning, meaningState);
  const model = useSyncExternalStore(onSupport, supportState);
  const [want, setWant] = useState(false);
  const [run, setRun] = useState<RetrievalRun>({ status: 'idle' });
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const ready = meaning.status === 'ready' && model.status === 'ready';
  const loading = meaning.status === 'loading' || model.status === 'loading';
  const failed = [meaning, model].flatMap((s) => (s.status === 'failed' ? [s.why] : []));
  const items = data.payload.claims.filter((c) => c.gold).map((c) => ({ claim: c.claim, text: data.payload.abstracts[c.doi] ?? '' }));

  useEffect(() => {
    if (!want || !ready) return;
    setWant(false);
    const mine = ++generation.current;
    setRun({ status: 'running', done: 0, total: items.length });
    compareRetrieval(items, {
      embed: embedder,
      threshold,
      score: (premise, claim) => scoreSupport(premise, claim).catch(() => null),
      stopped: () => generation.current !== mine,
      onProgress: (done, total) => { if (generation.current === mine) setRun({ status: 'running', done, total }); },
    })
      .then((result) => { if (generation.current === mine) setRun(result ? { status: 'done', result } : { status: 'cancelled' }); })
      .catch((e: unknown) => { if (generation.current === mine) setRun({ status: 'failed', why: e instanceof Error ? e.message : 'The comparison stopped.' }); });
    // items comes from data. The run starts once per press, when both models are ready.
  }, [want, ready, data, threshold]);

  const start = () => {
    setRun({ status: 'idle' });
    setWant(true);
    loadMeaning();
    loadSupport();
  };
  const stopAll = () => {
    generation.current++;
    setWant(false);
    if (run.status === 'running') setRun({ status: 'cancelled' });
    cancelMeaning();
    cancelSupport();
  };
  const cancelRun = () => {
    generation.current++;
    setRun({ status: 'cancelled' });
  };
  const result = run.status === 'done' ? run.result : null;

  return (
    <section className={`stack ${css.retrieval}`} aria-labelledby="lab-retrieval-heading">
      <h3 id="lab-retrieval-heading">Finding the sentence: by words or by meaning</h3>
      <p className="soft">For each of the {items.length} true claims, the top 3 sentences are picked two ways: by shared words only, and by meaning and words together. The support model then scores every picked sentence. A hit is a sentence it scores at {pct(threshold)} or more. The model is the referee here, not a person who marked the right sentence, so this shows agreement with the model. It never sets a label.</p>
      <p className="soft">It needs both on-device models, about {MEANING_MB + SUPPORT_MB} MB downloaded once ({MEANING_MB} MB to find sentences by meaning, {SUPPORT_MB} MB to score support), then loaded from this browser. Nothing is sent anywhere.</p>
      {!online && !ready && <p className={css.note}>You are offline. The models load only if this browser saved them before.</p>}
      <div className="row">
        {run.status === 'running' ? (
          <button className="btn" type="button" onClick={cancelRun}>Cancel comparison</button>
        ) : want && loading ? (
          <button className="btn" type="button" onClick={stopAll}>Cancel loading</button>
        ) : (
          <button className="btn" type="button" onClick={start}>{result ? 'Compare again' : 'Compare on this device'}</button>
        )}
        {(ready || (!want && loading)) && run.status !== 'running' && <button className="btn" type="button" onClick={stopAll}>Turn off and free the memory</button>}
      </div>
      <div aria-live="polite" className="stack">
        {want && loading && <p>Loading the models{meaning.status === 'loading' && meaning.total ? `: meaning model ${Math.round(meaning.loaded / 1e6)} of ${Math.round(meaning.total / 1e6)} MB` : ''}{model.status === 'loading' && model.total ? `; support model ${Math.round(model.loaded / 1e6)} of ${Math.round(model.total / 1e6)} MB` : ''}.</p>}
        {run.status === 'running' && <p>Comparing claim {run.done} of {run.total}.</p>}
        {run.status === 'cancelled' && <p className="soft">Comparison cancelled. Nothing from it is shown.</p>}
      </div>
      {run.status === 'running' && <progress className={css.progress} value={run.done} max={run.total} aria-label="Claims compared" />}
      {run.status === 'failed' && <p className={css.error}>{run.why}</p>}
      {failed.map((why) => <p key={why} className={css.error}>{why}</p>)}
      {result && (
        <div className="stack">
          <p><strong>Measured on this device just now.</strong> {result.n} true claims, hit at {pct(result.threshold)} support or more.</p>
          <div className={css.tableScroll} role="region" aria-labelledby="lab-retrieval-caption" tabIndex={0}>
            <table className={css.compact}>
              <caption id="lab-retrieval-caption">Hits by how the sentences were picked</caption>
              <thead><tr><th scope="col">Picked by</th><th scope="col">Top sentence is a hit</th><th scope="col">A hit in the top 3</th></tr></thead>
              <tbody>
                <tr><th scope="row">Shared words only</th><td>{ofN(result.words.top1)}<br /><span className="soft">{range(result.words.top1)}</span></td><td>{ofN(result.words.top3)}<br /><span className="soft">{range(result.words.top3)}</span></td></tr>
                <tr><th scope="row">Meaning and words</th><td>{ofN(result.meaning.top1)}<br /><span className="soft">{range(result.meaning.top1)}</span></td><td>{ofN(result.meaning.top3)}<br /><span className="soft">{range(result.meaning.top3)}</span></td></tr>
              </tbody>
            </table>
          </div>
          {result.unscored > 0 && <p className={css.note}>{result.unscored} picked sentences could not be scored. They count as no hit.</p>}
          <details className={css.details}>
            <summary>Each claim</summary>
            <div className={css.tableScroll} role="region" aria-label="Hits for each claim" tabIndex={0}>
              <table className={css.compact}>
                <thead><tr><th scope="col">Claim</th><th scope="col">Words: top 1, top 3</th><th scope="col">Meaning: top 1, top 3</th></tr></thead>
                <tbody>{result.rows.map((r) => (
                  <tr key={r.claim}><th scope="row">{r.claim}</th><td>{r.words.top1 ? 'Hit' : 'No hit'}, {r.words.top3 ? 'hit' : 'no hit'}</td><td>{r.meaning.top1 ? 'Hit' : 'No hit'}, {r.meaning.top3 ? 'hit' : 'no hit'}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

function BenchmarkSection({ online, onGoToLive }: { online: boolean; onGoToLive: () => void }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; b: Benchmark } | { status: 'failed'; why: string }>({ status: 'loading' });
  useEffect(() => {
    let current = true;
    loadBenchmark()
      .then((b) => { if (current) setState({ status: 'ready', b }); })
      .catch((e: unknown) => { if (current) setState({ status: 'failed', why: e instanceof Error ? e.message : 'The numbers could not be worked out.' }); });
    return () => { current = false; };
  }, []);

  return (
    <section className={`stack ${css.bench}`} aria-labelledby="lab-bench-heading" aria-busy={state.status === 'loading'}>
      <div className="row">
        <h2 id="lab-bench-heading">How accurate is it?</h2>
        <button className="btn quiet" type="button" onClick={onGoToLive}>Go to the live checks</button>
      </div>
      <p>We run our own checkers on cases where we already know the right answer, and count every mistake. Your browser works these numbers out each time this page opens, from recorded data. Nothing is sent anywhere.</p>
      {state.status === 'loading' && <p className="soft">Checking the recorded data and working out the numbers…</p>}
      {state.status === 'failed' && <p className={css.error}>{state.why} The live checks below still work.</p>}
      {state.status === 'ready' && <BenchmarkBody b={state.b} online={online} />}
    </section>
  );
}

function BenchmarkBody({ b, online }: { b: Benchmark; online: boolean }) {
  const { data, claims, references: refs, sample } = b;
  const pv = data.payload.provenance;
  const m = claims.main.metrics;
  const policy = claims.model.threshold;
  const atPolicy = claims.model.sweep.find((p) => p.threshold === policy);
  const showOther = m.confusion.true.other + m.confusion.false.other > 0;
  return (
    <>
      <div className={css.caveat}>
        <p><span className={css.sample}>SAMPLE</span> <strong>Recorded data. Read these limits first.</strong></p>
        <ul>
          <li>The team wrote these {m.total} claims against {pv.counts.abstracts} real abstracts. They are not student writing, and an abstract is short.</li>
          <li>This is a development set: the claim rules were tuned on it. From the hold-out file: “{pv.holdoutNote}” Only that first run was truly held out.</li>
          <li>The model’s scores were recorded once, on {day(pv.recordedAt)}, with {pv.model}. They are replayed here, not scored again.</li>
          <li>The reference numbers come from a recorded replay of the {refs.total} Lab cases, not from live registries.</li>
          <li>This is not a comparison with any other product.</li>
        </ul>
        <p className="soft">Worked out in {Math.max(1, Math.round(b.ms))} ms. Data SHA-256 <span className="mono">{data.sha256}</span>, built from {Object.keys(pv.sourceHashes).join(', ')}.</p>
      </div>

      <section className="stack" aria-labelledby="lab-claims-heading">
        <h3 id="lab-claims-heading">Claim checker</h3>
        <p className="soft">Each claim is judged by our real claim checker against the closest sentence in its abstract, with the recorded model scores, as the product runs with the model on. Each source is treated as one that passed the reference check, so only the claim checker is measured.</p>
        <ul className={css.cards} aria-label="Claim checker numbers">
          <Metric title="False claims labelled Verified" rate={m.falseVerified} bad={m.falseVerified.k > 0} note="Lower is better. This is the mistake that matters most." />
          <Metric title="True claims labelled Verified" rate={m.trueVerified} note="Recall. The rest stay Reported, not checked." />
          <Metric title="Verified labels that were right" rate={m.precision} note="Precision: of every Verified label, how many went to a true claim." />
          <Metric title="False claims labelled Disputed" rate={m.falseDisputed} note="The rest are Reported, not checked: not caught, but not passed either." />
        </ul>
        <div className={css.tableScroll} role="region" aria-labelledby="lab-matrix-caption" tabIndex={0}>
          <table className={css.compact}>
            <caption id="lab-matrix-caption">Labels given against the right answer, {m.total} claims</caption>
            <thead><tr>
              <th scope="col">Right answer</th><th scope="col">{CLAIM_TEXT.verified.label}</th><th scope="col">{CLAIM_TEXT.reported.label}</th><th scope="col">{CLAIM_TEXT.disputed.label}</th>{showOther && <th scope="col">Other</th>}<th scope="col">Total</th>
            </tr></thead>
            <tbody>
              {(['true', 'false'] as const).map((g) => (
                <tr key={g}>
                  <th scope="row">{g === 'true' ? 'True claim' : 'False claim'}</th>
                  <td>{m.confusion[g].verified}</td><td>{m.confusion[g].reported}</td><td>{m.confusion[g].disputed}</td>{showOther && <td>{m.confusion[g].other}</td>}<td>{g === 'true' ? m.trueN : m.falseN}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {m.unfitScores > 0 && <p className={css.note}>{m.unfitScores} recorded scores were left out because the closest sentence has changed since they were recorded. Record them again with MODEL=1.</p>}
      </section>

      <section className="stack" aria-labelledby="lab-sweep-heading">
        <h3 id="lab-sweep-heading">If the model alone decided</h3>
        <p className="soft">The product never lets the model decide. This shows what would happen if a support score at or above a line were enough for Verified, with no plain-code checks. {claims.model.scored} claims have recorded scores.</p>
        <SweepChart points={claims.model.sweep} policy={policy} />
        <ul className={css.facts}>
          {atPolicy && <li>The model alone at the policy line would pass {atPolicy.tp + atPolicy.fp} claims: {atPolicy.tp} true and {atPolicy.fp} false{atPolicy.precision.p === null ? '' : ` (precision ${pct(atPolicy.precision.p)})`}.</li>}
          <li>With the plain-code checks as well, as the product runs: {ofN(m.precision)} Verified labels right, {m.falseVerified.k} false claims passed.</li>
          {claims.model.auc !== null && <li>Area under the ROC curve for the support score: {claims.model.auc.toFixed(3)}. 1 means every true claim scores above every false one.</li>}
          {claims.model.brier !== null && <li>Brier score: {claims.model.brier.toFixed(3)}. 0 is perfect; lower is better.</li>}
          <li>The contradiction score alone at {pct(claims.model.contradiction.threshold)} flags {ofN(claims.model.contradiction.falseFlagged)} false claims and {ofN(claims.model.contradiction.trueFlagged)} true claims.</li>
        </ul>
        <details className={css.details}>
          <summary>Show the chart as a table</summary>
          <div className={css.tableScroll} role="region" aria-labelledby="lab-sweep-caption" tabIndex={0}>
            <table className={css.compact}>
              <caption id="lab-sweep-caption">The support score alone, by threshold</caption>
              <thead><tr><th scope="col">Threshold</th><th scope="col">True passed</th><th scope="col">False passed</th><th scope="col">True missed</th><th scope="col">Precision</th><th scope="col">Recall</th></tr></thead>
              <tbody>{claims.model.sweep.map((p) => (
                <tr key={p.threshold}>
                  <th scope="row">{pct(p.threshold)}{p.threshold === policy ? ' (policy line)' : ''}</th>
                  <td>{p.tp}</td><td>{p.fp}</td><td>{p.fn}</td><td>{p.precision.p === null ? 'None passed' : pct(p.precision.p)}</td><td>{p.recall.p === null ? 'No true claims' : pct(p.recall.p)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="stack" aria-labelledby="lab-ablation-heading">
        <h3 id="lab-ablation-heading">With and without the model</h3>
        <div className={css.tableScroll} role="region" aria-labelledby="lab-ablation-caption" tabIndex={0}>
          <table className={css.compact}>
            <caption id="lab-ablation-caption">The same {m.total} claims, three ways</caption>
            <thead><tr><th scope="col">Model</th><th scope="col">False claims Verified</th><th scope="col">False claims Disputed</th><th scope="col">True claims Verified</th><th scope="col">True claims Disputed</th><th scope="col">Verified labels right</th></tr></thead>
            <tbody>{claims.ablations.map((a) => (
              <tr key={a.mode}>
                <th scope="row">{a.name}<br /><span className={css.cellNote}>{a.note}</span></th>
                <td>{ofN(a.metrics.falseVerified)}</td><td>{ofN(a.metrics.falseDisputed)}</td><td>{ofN(a.metrics.trueVerified)}</td><td>{ofN(a.metrics.trueDisputed)}</td><td>{ofN(a.metrics.precision)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <details className={css.details}>
          <summary>By claim set</summary>
          <div className={css.tableScroll} role="region" aria-labelledby="lab-sets-caption" tabIndex={0}>
            <table className={css.compact}>
              <caption id="lab-sets-caption">Labels for each claim set</caption>
              <thead><tr><th scope="col">Set and model</th><th scope="col">Claims</th><th scope="col">{CLAIM_TEXT.verified.label}</th><th scope="col">{CLAIM_TEXT.reported.label}</th><th scope="col">{CLAIM_TEXT.disputed.label}</th></tr></thead>
              <tbody>{CLAIM_SETS.flatMap((s) => claims.ablations.map((a) => {
                const c = a.bySet.find((x) => x.set === s.id)!;
                return <tr key={`${s.id}-${a.mode}`}><th scope="row">{s.name}, {a.name.toLowerCase()}</th><td>{c.n}</td><td>{c.counts.verified}</td><td>{c.counts.reported}</td><td>{c.counts.disputed}</td></tr>;
              }))}</tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="stack" aria-labelledby="lab-refs-heading">
        <h3 id="lab-refs-heading">Reference checker</h3>
        <p className="soft">From the recorded replay of the {refs.total} Lab cases, run on {day(sample.payload.recordedAt)}. Cases without an answer are left out of the rates, listed below, and never counted as caught.</p>
        <ul className={css.cards} aria-label="Reference checker numbers">
          <Metric title="Invented references flagged" rate={refs.detection} bad={refs.invented.missed > 0} note={`Of the invented references that got an answer. Counting the ${refs.invented.unresolved} without one as misses: ${ofN(refs.detectionFloor)}.`} />
          <Metric title="Real references wrongly flagged" rate={refs.falseAlarms} bad={refs.real.falseAlarm > 0} note="False alarms, of the real references that got an answer. Lower is better." />
          <Metric title="Cases that got an answer" rate={refs.coverage} note={`Coverage. ${refs.total - refs.resolved} had no usable answer in the recording.`} />
        </ul>
      </section>

      <section className="stack" aria-labelledby="lab-every-miss-heading">
        <h3 id="lab-every-miss-heading">Every miss</h3>
        <p className="soft">Every claim that did not get the right label, and every Lab case that was missed, flagged wrongly or left without an answer. Worst first.</p>
        {claims.misses.length ? (
          <ul className={css.list} aria-label="Claim checker misses">{claims.misses.map((x) => <ClaimMissItem key={x.claim} m={x} />)}</ul>
        ) : <p className="soft">Every claim got the right label.</p>}
        {refs.open.length ? (
          <ul className={css.list} aria-label="Reference checker misses and cases without an answer">
            {refs.open.map(({ row, evaluation }) => (
              <li key={row.case.id} className={`card ${css.claimMiss}`} data-serious={evaluation.outcome === 'missed' || evaluation.outcome === 'false-alarm' ? 'true' : undefined}>
                <strong>{evaluation.text}</strong>
                <p className={css.reference}>{row.case.title}</p>
                <p className="soft">{FAMILY_LABELS[row.case.family]}{row.case.invented ? ', invented on purpose for this Lab' : ', a real reference'}. Expected: {EXPECTED[row.case.expected]}</p>
              </li>
            ))}
          </ul>
        ) : <p className="soft">Every Lab case got the expected answer.</p>}
      </section>

      <RetrievalCompare data={data} online={online} threshold={policy} />
    </>
  );
}

export function Lab() {
  const [live, setLive] = useState<LabRun | null>(null);
  const [sample, setSample] = useState<RecordedSample | null>(null);
  const [view, setView] = useState<'live' | 'sample'>('live');
  const [sampleLoading, setSampleLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const active = useRef<LabRunHandle | null>(null);
  const mounted = useRef(false);
  const runGeneration = useRef(0);
  const sampleGeneration = useRef(0);
  const sampleBusy = useRef(false);
  const startButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const sampleButton = useRef<HTMLButtonElement>(null);
  const sampleHeading = useRef<HTMLHeadingElement>(null);
  const runSection = useRef<HTMLElement>(null);
  const focusAfterUpdate = useRef<'cancel' | null>(null);
  const cancelHadFocus = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const connectionChanged = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', connectionChanged);
    window.addEventListener('offline', connectionChanged);
    return () => {
      mounted.current = false;
      runGeneration.current++;
      sampleGeneration.current++;
      sampleBusy.current = false;
      active.current?.cancel();
      active.current = null;
      window.removeEventListener('online', connectionChanged);
      window.removeEventListener('offline', connectionChanged);
    };
  }, []);

  const running = live?.status === 'running';
  useEffect(() => {
    if (focusAfterUpdate.current === 'cancel' && running) {
      cancelButton.current?.focus();
      focusAfterUpdate.current = null;
    } else if (!running && cancelHadFocus.current) {
      // Removing the focused Cancel button otherwise leaves keyboard focus on the body.
      cancelHadFocus.current = false;
      if (startButton.current && !startButton.current.disabled) startButton.current.focus();
      else if (sampleButton.current && !sampleButton.current.disabled) sampleButton.current.focus();
    }
  }, [running, online]);
  useEffect(() => {
    if (view === 'sample') sampleHeading.current?.focus();
  }, [view]);

  function goToLive() {
    runSection.current?.scrollIntoView?.({ block: 'start' });
    const target = startButton.current && !startButton.current.disabled ? startButton.current : sampleButton.current;
    target?.focus({ preventScroll: true });
  }

  function cancelLive() {
    const handle = active.current;
    if (!handle || handle.snapshot().status !== 'running') return;
    handle.cancel();
    if (mounted.current) setLive(handle.snapshot());
  }

  function startLive() {
    if (!online || active.current?.snapshot().status === 'running') return;
    const generation = ++runGeneration.current;
    sampleGeneration.current++;
    sampleBusy.current = false;
    setSampleLoading(false);
    setNotice('');
    setView('live');
    focusAfterUpdate.current = 'cancel';
    try {
      const handle = startLabRun({
        onUpdate: (next) => {
          if (mounted.current && runGeneration.current === generation) setLive(next);
        },
      });
      active.current = handle;
      if (mounted.current && runGeneration.current === generation) setLive(handle.snapshot());
      else handle.cancel();
    } catch (error) {
      focusAfterUpdate.current = null;
      setNotice(error instanceof Error ? error.message : 'The live run could not be started.');
    }
  }

  async function showSample() {
    if (sampleBusy.current) return;
    cancelLive();
    // The cancelled controller preserves its partial snapshot. A late result cannot replace it.
    runGeneration.current++;
    const generation = ++sampleGeneration.current;
    setNotice('');
    if (sample) {
      setView('sample');
      return;
    }
    sampleBusy.current = true;
    setSampleLoading(true);
    try {
      const recording = await loadSample();
      if (!mounted.current || sampleGeneration.current !== generation) return;
      setSample(recording);
      setView('sample');
    } catch (error) {
      if (mounted.current && sampleGeneration.current === generation) setNotice(error instanceof Error ? error.message : 'The recorded sample could not be opened.');
    } finally {
      if (mounted.current && sampleGeneration.current === generation) {
        sampleBusy.current = false;
        setSampleLoading(false);
      }
    }
  }

  const shownRun = view === 'sample' && sample ? sample.payload.run : live;
  const rows = shownRun?.rows ?? INITIAL_ROWS;
  const results = rows.filter((row) => row.state === 'completed').length;
  const errors = rows.filter((row) => row.state === 'error').length;
  const finished = results + errors;
  const families = summarizeFamilies(rows);
  const misses = rows.filter((row) => ['missed', 'false-alarm'].includes(evaluateCase(row).outcome));
  const isSample = view === 'sample' && !!sample;
  const status = sampleLoading
    ? 'Opening the recorded sample. Any live run has been cancelled; its results are preserved.'
    : !shownRun
      ? `Ready. 0 of ${rows.length} cases run.`
      : `${isSample ? 'Recorded sample' : 'Live run'} ${shownRun.status === 'running' ? 'running' : shownRun.status === 'cancelled' ? 'cancelled' : 'completed'}: ${finished} of ${rows.length} cases finished; ${results} checker results${errors ? `, ${errors} errors` : ''}.`;

  return (
    <main className="wrap page" id="main" tabIndex={-1}>
      <div className="stack">
        <h1>Integrity Lab</h1>
        <p className="soft">We test our own checker here, in public. Half of these references are real and half are invented on purpose. Every miss stays on this page.</p>
      </div>

      <BenchmarkSection online={online} onGoToLive={goToLive} />

      <section ref={runSection} className="stack" aria-label="Run controls">
        <div className="row">
          <button ref={startButton} className="btn main" type="button" disabled={running || !online} onClick={startLive}>Run live checks</button>
          {running && <button ref={cancelButton} className="btn" type="button" onFocus={() => { cancelHadFocus.current = true; }} onBlur={() => { cancelHadFocus.current = false; }} onClick={cancelLive}>Cancel run</button>}
          <button ref={sampleButton} className="btn" type="button" disabled={sampleLoading} onClick={() => void showSample()}>View recorded sample</button>
          {isSample && <button className="btn" type="button" onClick={() => { setView('live'); startButton.current?.focus(); }}>{live ? 'Back to live results' : 'Back to fixed cases'}</button>}
        </div>
        <details>
          <summary>What these checks do and do not show</summary>
          <div className="stack">
            <p className="soft">Run our real metadata checker against a fixed set of public references and deliberately altered inputs. Every case stays visible, including misses, errors and unfinished checks.</p>
            <p className="soft">Corpus version {CORPUS_MANIFEST.version}: {LAB_CORPUS.filter((item) => !item.invented).length} real controls and {LAB_CORPUS.filter((item) => item.invented).length} invented exercises. This checks structured metadata, not the paste parser, scientific truth or support for a claim.</p>
            <p>Run live checks sends the fixed public or labelled invented reference fields below to scholarly registries. Your project library is not part of this run.</p>
            <p className="soft">Lookups may reuse responses cached during this page load. Run timestamps show checker execution, not guaranteed fresh registry fetches.</p>
            <p className="soft">Cancel stops new cases and ignores late results; in-flight requests may finish. Viewing the sample also cancels a live queue and preserves its completed results.</p>
          </div>
        </details>
        {!online && <p className={css.note}>Your browser reports that it is offline. The recorded sample is available without registry requests; live checks become available when the browser reports a connection.</p>}
        {notice && <p className={css.error} role="alert">{notice}</p>}
      </section>

      <p className={css.status} role="status" aria-live="polite" aria-atomic="true">{status}</p>

      {isSample && sample ? (
        <section className={`card ${css.recording}`} aria-label="Recorded sample context">
          <h2 ref={sampleHeading} tabIndex={-1}>SAMPLE — recorded replay</h2>
          <p>Original registry capture time is unknown. This replay was executed on <Time value={sample.payload.recordedAt} />; its responses are not live.</p>
          <p className="soft">Only retry delays were simulated; checker timestamps record when the replay actually ran. They do not measure live network latency. Missing replay coverage means a request was not in the recording, not that a live registry was down.</p>
          <details className={css.details}>
            <summary>Recording provenance</summary>
            <dl className={css.provenance}>
              <div><dt>Corpus version</dt><dd>{sample.payload.run.corpusVersion}</dd></div>
              <div><dt>Recording SHA-256</dt><dd className="mono">{sample.sha256}</dd></div>
              <div><dt>Corpus SHA-256</dt><dd className="mono">{sample.payload.corpusHash}</dd></div>
              {Object.entries(sample.payload.sourceHashes).map(([path, hash]) => <div key={path}><dt>{path}</dt><dd className="mono">{hash}</dd></div>)}
            </dl>
          </details>
        </section>
      ) : live && (
        <section className="stack" aria-label="Live run timing">
          <h2>Live run</h2>
          <p className="soft">Started <Time value={live.startedAt} />{live.finishedAt && <>. {live.status === 'cancelled' ? 'Cancelled' : 'Finished'} <Time value={live.finishedAt} /></>}.</p>
        </section>
      )}

      <section className={`stack ${misses.length ? css.misses : ''}`} aria-labelledby="lab-misses-heading">
        <h2 id="lab-misses-heading">Misses and false alarms</h2>
        {misses.length > 0 ? (
          <ul className={css.list}>
            {misses.map((row) => (
              <li key={row.case.id} className={`card ${css.miss}`}>
                <strong>{evaluateCase(row).text}</strong>
                <p className={row.case.invented ? css.invented : 'soft'}>{row.case.label}</p>
                <p className={css.reference}>{row.case.reference.raw}</p>
                {evaluateCase(row).limitedCoverage && <p className={css.coverage}>A lookup also lacked coverage. The miss or false alarm remains visible.</p>}
              </li>
            ))}
          </ul>
        ) : <p className="soft">{results ? 'No misses or false alarms were observed in the completed results shown. Unresolved and unfinished cases are not passes.' : 'No completed checker results yet. Any miss or false alarm will be listed here with its complete input.'}</p>}
      </section>

      <section className="stack">
        <h2 id="lab-family-heading">Results by family</h2>
        <p id="lab-table-help" className="soft">Scroll this table horizontally to inspect every outcome. A correctly flagged real retraction has its own column; it is not a false alarm. Coverage-gap counts overlap the outcomes and are not added to the total.</p>
        <div className={css.tableScroll} role="region" aria-labelledby="lab-family-heading" aria-describedby="lab-table-help" tabIndex={0}>
          <table className={css.table}>
            <caption>{isSample ? 'Recorded replay outcomes' : shownRun ? 'Current live-run outcomes' : 'Fixed corpus, not yet run'}. Counts describe these cases, not whole-platform accuracy.</caption>
            <thead><tr>
              <th scope="col">Family</th><th scope="col">Cases</th><th scope="col">Real matched</th><th scope="col">Expected retraction</th><th scope="col">Caught</th><th scope="col">Missed</th><th scope="col">False alarm</th><th scope="col">Could not check</th><th scope="col">Other unresolved / error</th><th scope="col">Active</th><th scope="col">Cancelled</th><th scope="col">Not run</th><th scope="col">Coverage gaps</th>
            </tr></thead>
            <tbody>{families.map((family) => <tr key={family.family}>
              <th scope="row">{family.label}</th><td>{family.total}</td><td>{family.correct}</td><td>{family.retraction}</td><td>{family.caught}</td><td>{family.missed}</td><td>{family.falseAlarm}</td><td>{family.couldNotCheck}</td><td>{family.unresolved}</td><td>{family.active}</td><td>{family.cancelled}</td><td>{family.unrun}</td><td>{family.limitedCoverage}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className={css.note}>If the second registry does not answer, the checker says One registry only and the case counts as unresolved here, never as a success. An invented input that was accepted stays a miss even when another lookup failed.</p>
      </section>

      <section className="stack" aria-labelledby="lab-cases-heading" aria-busy={shownRun?.status === 'running' && !isSample}>
        <h2 id="lab-cases-heading">Every case and its evidence</h2>
        <p className="soft">The complete input and authenticity label stay visible. Open a case's trace to inspect the checker response and the captured metadata used to construct the input.</p>
        <ul className={css.list} aria-label="All cases">{rows.map((row) => <CaseResult key={row.case.id} row={row} sample={isSample} />)}</ul>
      </section>

      <section className="stack" aria-labelledby="lab-limits-heading">
        <h2 id="lab-limits-heading">How to read these results</h2>
        <p>Caught means the checker flagged an invented input; inspect its reasons to see what it actually detected. An invented reference accepted as Confirmed is a miss. A flag on an ordinary real control is a false alarm against the frozen expectation and needs inspection. Could not check, errors and incomplete coverage remain visible.</p>
        <p className="soft">The corpus is fixed before measurement and is not a representative sample of every discipline, language or citation format. Nothing found in a lookup is different from proving that a source does not exist. These cases are not citation recommendations.</p>
      </section>
    </main>
  );
}
