import { useEffect, useRef, useState } from 'react';
import { REASON_TEXT } from '@/core/contracts';
import { CORPUS_MANIFEST, LAB_CORPUS, type LabExpectation } from '@/core/lab/corpus';
import { evaluateCase, FAMILY_LABELS, isKnownVerdict, summarizeFamilies } from '@/core/lab/evaluate';
import { startLabRun, type LabRow, type LabRun, type LabRunHandle } from '@/core/lab/runner';
import { loadSample, type RecordedSample } from '@/core/lab/sample';
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
        <p className="soft">Run our real metadata checker against a fixed set of public references and deliberately altered inputs. Every case stays visible, including misses, errors and unfinished checks.</p>
        <p className="soft">Corpus version {CORPUS_MANIFEST.version}: {LAB_CORPUS.filter((item) => !item.invented).length} real controls and {LAB_CORPUS.filter((item) => item.invented).length} invented exercises. This checks structured metadata, not the paste parser, scientific truth or support for a claim.</p>
      </div>

      <section className="stack" aria-label="Run controls">
        <p>Run live checks sends the fixed public or labelled invented reference fields below to scholarly registries. Your project library is not part of this run.</p>
        <p className="soft">Lookups may reuse responses cached during this page load. Run timestamps show checker execution, not guaranteed fresh registry fetches.</p>
        <div className="row">
          <button ref={startButton} className="btn main" type="button" disabled={running || !online} onClick={startLive}>Run live checks</button>
          {running && <button ref={cancelButton} className="btn" type="button" onFocus={() => { cancelHadFocus.current = true; }} onBlur={() => { cancelHadFocus.current = false; }} onClick={cancelLive}>Cancel run</button>}
          <button ref={sampleButton} className="btn" type="button" disabled={sampleLoading} onClick={() => void showSample()}>View recorded sample</button>
          {isSample && <button className="btn" type="button" onClick={() => { setView('live'); startButton.current?.focus(); }}>{live ? 'Back to live results' : 'Back to fixed cases'}</button>}
        </div>
        <p className="soft">Cancel stops new cases and ignores late results; in-flight requests may finish. Viewing the sample also cancels a live queue and preserves its completed results.</p>
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
