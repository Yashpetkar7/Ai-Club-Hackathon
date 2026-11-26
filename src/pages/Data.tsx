import { useEffect, useState, type FormEvent } from 'react';
import { Link } from '@/app/router';
import { retractionWatch, type RwEntry, type RwMeta } from '@/core/registries/retractionWatch';
import { RISK_MODEL } from '@/core/risk/risk';
import { SUPPORT } from '@/core/claims/support';
import results from '../../ml/results/finetune.json';
import outside from '../../ml/results/outside-check.json';
import css from './Data.module.css';

/** Every source of data and every model the site uses, where it came from, and what it is allowed to decide. */
const LIVE: [string, string, string, string][] = [
  ['Crossref', 'https://www.crossref.org/documentation/retrieve-metadata/rest-api/', 'Looks up a DOI, searches by title, and reads retraction, correction and concern notices.', 'Open metadata. No key.'],
  ['OpenAlex', 'https://docs.openalex.org/', 'Second registry for every match, abstracts, citation links, retraction flags, papers you may be missing.', 'CC0. About 100 searches a day per network without a free key; DOI lookups are not limited.'],
  ['DataCite', 'https://support.datacite.org/docs/api', 'DOIs that Crossref does not hold: datasets, reports, theses.', 'CC0. No key.'],
  ['doi.org', 'https://www.doi.org/the-identifier/resources/factsheets/doi-resolution-documentation', 'Says whether a DOI exists at all, when no registry has it.', 'Public handle service. No key.'],
];

const FIXTURES: [string, string][] = [
  ['tests/unit/fixtures/registry.json', 'Real Crossref and OpenAlex answers, saved once, so the tests run offline and give the same result every time.'],
  ['src/core/lab/corpus.ts', 'Integrity Lab: 12 real references and 12 altered on purpose by our code, each labelled “Invented for this Lab; do not cite”.'],
  ['tests/claims-set.ts, tests/claims-holdout-set.ts', 'Claims about real abstracts, true and false, written before the first run. Used to prove no false claim is ever Verified.'],
  ['src/fixtures/sample.ts', 'The demo text on Check. Three real references (one retracted) and two invented on purpose; the page says so.'],
  ['public/styles/*.csl', 'Citation styles from the Citation Style Language project, CC BY-SA 3.0.'],
];

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

interface Scores { pairs: number; accuracy: number; macroF1: number; supportRecallAt09: number; falseSupport: number; falseSupportRate: number; falseContradiction: number }
/** Written by ml/finetune_claims.py and ml/export_onnx.py; the page shows only what is in the file. */
const tuned = results as unknown as {
  base: string;
  baseDev: Scores;
  baseInt8Dev?: Scores;
  shipped?: Record<string, { dev: Scores; mb: number }>;
  inChrome?: Record<string, { model: string; falseVerified: string; trueVerified: string; modelAloneWouldPass: number; recordedAt: string }>;
};

export function Data() {
  const [meta, setMeta] = useState<RwMeta | 'loading' | 'failed'>('loading');
  const [doi, setDoi] = useState('');
  const [found, setFound] = useState<{ doi: string; entry: RwEntry | null } | 'looking' | 'failed' | null>(null);

  useEffect(() => {
    let on = true;
    retractionWatch
      .meta()
      .then((m) => on && setMeta(m))
      .catch(() => on && setMeta('failed'));
    return () => {
      on = false;
    };
  }, []);

  const look = async (e: FormEvent) => {
    e.preventDefault();
    const d = doi.trim().match(/10\.\d{4,9}\/\S+/)?.[0];
    if (!d) return setFound(null);
    setFound('looking');
    try {
      setFound({ doi: d, entry: await retractionWatch.lookup(d) });
    } catch {
      setFound('failed');
    }
  };

  // Compare like with like: both as the 8-bit file a browser runs, when that measurement exists.
  const base = tuned.baseInt8Dev ?? tuned.baseDev;
  const ship = tuned.shipped?.['paper-trail-nli-scifact']?.dev;
  const chrome = tuned.inChrome;

  return (
    <main className={`wrap page ${css.page}`} id="main" tabIndex={-1}>
      <div className="stack">
        <h1>Data and models</h1>
        <p className={css.lead}>Where every fact on this site comes from, and what each model is allowed to decide. No paid service, and nothing here is a guess dressed up as a check.</p>
      </div>

      <section className="stack" aria-labelledby="live">
        <h2 id="live">Asked live, every time you check</h2>
        <p className="soft">Requests go through our own allow-listed proxy when the server runs, or straight from your browser on a static host. Only the DOI or title being checked is sent.</p>
        <div className={css.table} role="table" aria-label="Live registries">
          {LIVE.map(([name, url, what, terms]) => (
            <div role="row" key={name} className={css.rowLine}>
              <span role="cell">
                <a href={url} target="_blank" rel="noreferrer">
                  <strong>{name}</strong>
                </a>
              </span>
              <span role="cell">{what}</span>
              <span role="cell" className="soft">
                {terms}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="stack" aria-labelledby="rw">
        <h2 id="rw">Shipped with the site: Retraction Watch</h2>
        <p>
          The <a href="https://gitlab.com/crossref/retraction-watch-data">Retraction Watch database</a>, made public by Crossref, is built into a DOI index that ships with the site. Every check looks the DOI up in it, next to Crossref and OpenAlex. It can add a retraction or an expression of concern, with the reasons Retraction Watch recorded. It can never remove one, and if the index cannot be read the check says so.
        </p>
        {meta === 'loading' && <p className="soft">Reading the index…</p>}
        {meta === 'failed' && <p role="alert">The index could not be read. Checks still ask Crossref and OpenAlex.</p>}
        {typeof meta === 'object' && (
          <dl className={css.facts}>
            <div>
              <dt>Retracted papers</dt>
              <dd>{meta.counts.retracted.toLocaleString('en-GB')}</dd>
            </div>
            <div>
              <dt>Under an expression of concern</dt>
              <dd>{meta.counts.concern.toLocaleString('en-GB')}</dd>
            </div>
            <div>
              <dt>Notices read</dt>
              <dd>{meta.csvRows.toLocaleString('en-GB')}</dd>
            </div>
            <div>
              <dt>Reasons in its list</dt>
              <dd>{meta.reasons.length}</dd>
            </div>
          </dl>
        )}
        {typeof meta === 'object' && (
          <p className={`soft ${css.small}`}>
            Built by <code>scripts/build-retraction-index.mjs</code> from a CSV with SHA-256 <code>{meta.csvSha256.slice(0, 16)}…</code>. Papers with no DOI ({meta.counts.skippedNoDoi.toLocaleString('en-GB')} notices) cannot be looked up; {meta.counts.reinstated} reinstated papers are left out.
          </p>
        )}
        <form className={`row ${css.look}`} onSubmit={look} aria-label="Look up a DOI in the Retraction Watch index">
          <label className="field">
            <span>DOI</span>
            <input value={doi} onChange={(e) => setDoi(e.target.value)} placeholder="10.1007/s12035-015-9252-9" spellCheck={false} />
          </label>
          <button className="btn" type="submit">
            Look it up
          </button>
        </form>
        <div aria-live="polite">
          {found === 'looking' && <p className="soft">Looking…</p>}
          {found === 'failed' && <p role="alert">The index could not be read. That is not a pass.</p>}
          {found && typeof found === 'object' && !found.entry && (
            <p>
              Retraction Watch lists no notice for <code>{found.doi}</code>. That alone does not prove it was never retracted: <Link to="/check">run a full check</Link>, which also asks the publisher through Crossref.
            </p>
          )}
          {found && typeof found === 'object' && found.entry && (
            <p className={css.hit}>
              <strong>{found.entry.status === 'retracted' ? 'Retracted' : 'Expression of concern'}</strong>
              {found.entry.on ? `, ${found.entry.on}` : ''}. Reasons recorded: {found.entry.reasons.join('; ') || 'none given'}.
              {found.entry.notice && (
                <>
                  {' '}
                  <a href={`https://doi.org/${found.entry.notice}`} target="_blank" rel="noreferrer">
                    Read the notice
                  </a>
                </>
              )}
            </p>
          )}
        </div>
      </section>

      <section className="stack" aria-labelledby="models">
        <h2 id="models">Models we trained</h2>

        <article className="card stack">
          <h3>Claim support, fine-tuned on SciFact</h3>
          <p>
            The Evidence step asks a small model, on your device, whether one sentence of a paper supports your claim. It can only ever add a “supports” score; the label still needs the exact sentence, the numbers and the direction to agree. We fine-tuned the model we already ran (
            <code>{tuned.base}</code>) on <a href="https://github.com/allenai/scifact">SciFact</a>, real scientific claims checked against real abstracts. SciFact’s dev set was held out until the end.
          </p>
          <div className={css.table} role="table" aria-label="Held-out SciFact results">
            <div role="row" className={`${css.rowLine} ${css.head}`}>
              <span role="columnheader">On {base.pairs} held-out pairs</span>
              <span role="columnheader">Original{tuned.baseInt8Dev ? ' (8-bit file)' : ''}</span>
              <span role="columnheader">Fine-tuned (8-bit file)</span>
            </div>
            {ship &&
              (
                [
                  ['Accuracy', pct(base.accuracy), pct(ship.accuracy)],
                  ['Macro F1', base.macroF1.toFixed(3), ship.macroF1.toFixed(3)],
                  ['Supports found at the 0.9 bar', pct(base.supportRecallAt09), pct(ship.supportRecallAt09)],
                  ['Wrong “supports” at the 0.9 bar', `${base.falseSupport} (${pct(base.falseSupportRate)})`, `${ship.falseSupport} (${pct(ship.falseSupportRate)})`],
                  ['Wrong “contradicts” at the 0.9 bar', String(base.falseContradiction), String(ship.falseContradiction)],
                ] as const
              ).map(([k, a, b]) => (
                <div role="row" key={k} className={css.rowLine}>
                  <span role="rowheader">{k}</span>
                  <span role="cell">{a}</span>
                  <span role="cell">{b}</span>
                </div>
              ))}
          </div>
          {chrome && (
            <ul className={css.list}>
              {Object.entries(chrome).map(([k, v]) => (
                <li key={k}>
                  {v.model}, in Chrome on our own claim sets: false claims Verified {v.falseVerified}, true claims Verified {v.trueVerified}. Alone it would have passed {v.modelAloneWouldPass} false claims; the rule-based guards stopped every one.
                </li>
              ))}
            </ul>
          )}
          <p className="soft">
            This site runs: <strong>{SUPPORT.label}</strong>. {SUPPORT.why}
          </p>
        </article>

        <article className="card stack">
          <h3>Retraction risk signal</h3>
          <p>
            A small logistic regression trained on {RISK_MODEL.trainedOn.positives.toLocaleString('en-GB')} papers Retraction Watch lists as retracted and {RISK_MODEL.trainedOn.negatives.toLocaleString('en-GB')} random journal articles from Crossref, using only publisher, journal, year and number of authors. No title, no notice, no citation count. Page, volume and issue were tried and dropped, because a paper withdrawn before print never gets a volume, so they would flag every new online-first paper.
          </p>
          <p>
            On {RISK_MODEL.test.n.toLocaleString('en-GB')} held-out papers it ranks a retracted paper above an ordinary one {pct(RISK_MODEL.test.auc)} of the time (ROC AUC). On papers from journals it never saw it scores {pct(RISK_MODEL.test.aucUnseenJournals)}, and without publisher or journal names at all {pct(RISK_MODEL.test.aucWithoutNames)}, so much of the signal is where a paper was published. It is a reason to read carefully, never a verdict: it never changes a check, never turns anything red or green, and a paper with a high score may be perfectly sound.
          </p>
        </article>
      </section>

      <section className="stack" aria-labelledby="outside">
        <h2 id="outside">A live test on papers we had never used</h2>
        <p>
          On {new Date(outside.summary.checkedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dubai' })} (Dubai), the real checker looked up {outside.rows.length} references that are in none of our test files, against the live registries:
        </p>
        <ul className={css.list}>
          <li>
            {outside.summary.real.confirmed} of {outside.summary.real.n} real papers from a random Crossref sample were Confirmed.
          </li>
          <li>
            {outside.summary.retracted.flagged} of {outside.summary.retracted.n} papers Retraction Watch lists as retracted were flagged Retracted.
          </li>
          <li>
            {outside.summary.altered.caught} of {outside.summary.altered.n} real references that our code altered on purpose (a wrong year or first author) were caught, and none was Confirmed.
          </li>
        </ul>
        <p className={`soft ${css.small}`}>
          Twenty references is a spot check, not an accuracy rate. Every row, with the registries asked, is in <code>ml/results/outside-check.json</code>; rerun it with <code>LIVE=1 npx vitest run tests/unit/outside-live.test.ts</code>.
        </p>
      </section>

      <section className="stack" aria-labelledby="fixed">
        <h2 id="fixed">Recorded data for tests and demos</h2>
        <dl className={css.fixtures}>
          {FIXTURES.map(([p, what]) => (
            <div key={p}>
              <dt>
                <code>{p}</code>
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="stack" aria-labelledby="leave">
        <h2 id="leave">What leaves your device</h2>
        <ul className={css.list}>
          <li>The DOI or title you check goes to the registries above. Nothing else about you.</li>
          <li>The claim-support model and the Retraction Watch index are downloaded once and run in your browser.</li>
          <li>The optional assistant (Groq or Gemini) runs only at the AI level you choose, and only if the site has a key.</li>
          <li>With an account, only a copy locked in your browser is saved on our server. We cannot read it.</li>
        </ul>
      </section>
    </main>
  );
}
