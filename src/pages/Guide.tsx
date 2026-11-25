import { Link } from '@/app/router';
import { CLAIM_TEXT, VERDICT_TEXT, type ClaimLabel, type Verdict } from '@/core/contracts';
import { ClaimStamp, VerdictStamp } from '@/ui/Stamp';
import css from './Guide.module.css';

/** The whole site in plain words, for someone who has never seen it. */
const STEPS: [string, string, string][] = [
  ['Plan', 'Write your question. We suggest a few searches. Change them, then approve.', 'You open gate 1'],
  ['Find', 'We search scholarly registries and look every paper up twice. Press Keep or Skip.', 'You open gate 2'],
  ['Library', 'Everything you kept, with folders, tags and notes. Add papers by DOI, PDF, BibTeX or a web address. Press Approve on the ones you want to cite.', ''],
  ['Evidence', 'Type a sentence you want to write. We show the exact sentence in the paper that says it, or tell you it is not there.', 'You open gate 3'],
  ['Write', 'You write the text. Press Cite to add a citation. Press Check my draft to find copied words, wrong quotations and slips.', ''],
  ['Export', 'Your reference list in APA 7, Harvard, MLA, Chicago or IEEE, as Word, BibTeX or RIS, with a statement of any AI you used.', ''],
];
const HELPERS: [string, string][] = [
  ['Team', 'Runs all nine agents in order and stops whenever it needs you.'],
  ['Read', 'Sorts a paper’s own sentences into aim, method, findings and limits. Compares papers side by side.'],
  ['Map', 'Shows which of your papers cite each other, and papers you may be missing.'],
  ['Ask', 'Answers a question with exact sentences from sources you approved, or says “Not found”.'],
  ['Challenge', 'Looks for evidence against your claim.'],
  ['Review', 'Lists what a marker could question before you hand in.'],
];
const VERDICTS: Verdict[] = ['confirmed', 'one-registry', 'details-differ', 'wrong-paper', 'retracted', 'not-found', 'could-not-check'];
const LABELS: ClaimLabel[] = ['verified', 'reported', 'disputed', 'ai-reasoning', 'not-found'];

export function Guide() {
  return (
    <main className={`wrap page ${css.page}`} id="main" tabIndex={-1}>
      <div className="stack">
        <h1>How it works</h1>
        <p className={css.lead}>Paper Trail helps you find, organise and cite sources. AI tools are fast, but they invent references. Here, nothing can be cited until three keys have turned.</p>
        <div className="row">
          <button className="btn main" type="button" onClick={() => window.dispatchEvent(new Event('pt:tour'))}>
            Take the one-minute tour
          </button>
          <Link to="/projects" className="btn">
            Start a project
          </Link>
        </div>
      </div>

      <section className="stack" aria-label="The three keys">
        <h2>Three keys</h2>
        <ol className={css.keys}>
          <li>
            <strong>Found</strong> A scholarly registry has the paper. An AI’s memory does not count.
          </li>
          <li>
            <strong>Checked</strong> Plain code compares title, authors, year and DOI, and asks a second registry.
          </li>
          <li>
            <strong>Approved</strong> You press the button. AI holds none of the keys.
          </li>
        </ol>
      </section>

      <section className="stack" aria-label="The six steps">
        <h2>Six steps</h2>
        <ol className={css.steps}>
          {STEPS.map(([name, what, gate]) => (
            <li key={name} className="card">
              <div>
                <strong>{name}</strong>
                {gate && <small>{gate}</small>}
              </div>
              <p>{what}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="stack" aria-label="The helpers">
        <h2>Six helpers</h2>
        <p className="soft">Use them when you need them. None is required.</p>
        <dl className={css.helpers}>
          {HELPERS.map(([n, t]) => (
            <div key={n}>
              <dt>{n}</dt>
              <dd>{t}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="stack" aria-label="What the labels mean">
        <h2>What the labels mean</h2>
        <div className={css.two}>
          <div className="stack">
            <h3>On a reference</h3>
            <dl className={css.labels}>
              {VERDICTS.map((v) => (
                <div key={v}>
                  <dt>
                    <VerdictStamp verdict={v} />
                  </dt>
                  <dd>{VERDICT_TEXT[v].plain}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="stack">
            <h3>On a sentence</h3>
            <dl className={css.labels}>
              {LABELS.map((l) => (
                <div key={l}>
                  <dt>
                    <ClaimStamp label={l} />
                  </dt>
                  <dd>{CLAIM_TEXT[l].plain}</dd>
                </div>
              ))}
            </dl>
            <p>Green only ever means proven.</p>
          </div>
        </div>
      </section>

      <section className="stack" aria-label="Where your work is saved">
        <h2>Where your work is saved</h2>
        <ul className={css.list}>
          <li>As a guest: in this browser only.</li>
          <li>With an account: in this browser, and as a locked copy on our server so you can sign in on another computer. It is locked with your passphrase before it leaves, so we cannot read it.</li>
          <li>We cannot reset a passphrase, because we never have it. Keep a backup file from your account page.</li>
        </ul>
      </section>

      <section className="stack" aria-label="What it will not do">
        <h2>What it will not do</h2>
        <ul className={css.list}>
          <li>Write your assignment.</li>
          <li>Call a source fake. It says where it looked and what it did not find.</li>
          <li>Search the whole web for copied text. It compares your draft with your own sources.</li>
        </ul>
      </section>
    </main>
  );
}
