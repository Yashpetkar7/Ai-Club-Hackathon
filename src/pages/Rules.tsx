import { useState } from 'react';
import { policyLines } from '@/policy/apply';
import { AGENTS, AI_LEVELS, POLICY } from '@/policy/policy';
import { deleteEverything } from '@/store/actions';
import css from './Rules.module.css';

const POLICY_URL = 'https://www.spjain.ae/hubfs/policies-pdf/Academic-Integrity-Policy-and-Procedures.pdf';

/** Our own words, not the policy's. The link goes to the real text. */
const CLAUSES: [string, string, string][] = [
  ['s10(h)(vi)', 'Students acknowledge other people’s work, using APA.', 'APA 7 is the default style. A list leaves only through pre-flight.'],
  ['s10(h)(vii)', 'Generative AI is used only as the assessment allows.', 'Each project carries an AI level from 0 to 3. The server refuses anything above it.'],
  ['s10(h)(viii)', 'Students name the AI tools and prompts they used.', 'Every AI call is logged with its model and prompt. The AI-use statement is written from that log.'],
  ['s10(h)(ix)', 'Students watch for references that AI made up.', 'The Checker and the three keys. AI can never add a reference.'],
  ['s3(a)(ii), s3(b)(iv)', 'Work an AI produced is not handed in as your own unless allowed.', 'There is no writing feature. At level 0 every AI agent is locked.'],
  ['s10(g)(vi)', 'Faculty check references and citations.', 'The evidence report shows every verdict, reason and exact sentence on one page.'],
];
const CAN = ['Whether a reference matches a work in Crossref, OpenAlex, DataCite or doi.org', 'Whether your draft repeats eight or more words in a row from a source in your library', 'Whether a quotation in your draft is in the source you cite', 'Whether a journal has retracted, corrected or warned about a work', 'Which of title, authors, year or DOI differs', 'Whether a registry marks the work as retracted', 'Whether the exact words you quote are in the text we could read', 'Whether a number, direction or scope word in your claim differs from that sentence'];
const CANNOT = ['Whether a source is right', 'Books, reports and regional journals that no registry lists', 'Text behind a paywall, unless you add the PDF yourself', 'Text copied from the web, from books or from other students, and whether the writing is yours', 'Sources in languages other than English, when a claim is compared with a sentence'];
const LEAVES: [string, string][] = [
  ['Search words and reference details', 'Go to Crossref, OpenAlex, DataCite and doi.org when you press Find, Check or Challenge.'],
  ['A question, a claim or numbered passages from sources you kept', 'Go to an AI service only at level 1 or higher, only when you press that button, and only if the site has a key.'],
  ['The support model', 'Downloads to your device once, when you ask for it. Your claim is not sent.'],
  ['Your account name and passphrase', 'Never leave this browser. The passphrase is never stored. Signing out encrypts your library with it.'],
  ['Your library, notes, PDFs, draft and log', 'Never leave this browser, unless you export them.'],
];
const WHO: [string, string][] = [
  ['You', 'Every source you approve, every claim you accept, and everything you hand in.'],
  ['Code', 'Each verdict and label, by rules shown on this page.'],
  ['AI', 'Nothing. It holds no key and can only suggest.'],
  ['Team 1', 'Faults in the checks. The Integrity Lab shows our own misses.'],
  ['The school', 'What counts as misconduct. Paper Trail never decides that.'],
];

function Table({ name, head, rows }: { name: string; head: string[]; rows: string[][] }) {
  return (
    <div className={css.scroll} role="region" aria-label={name} tabIndex={0}>
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]}>
              <th scope="row">{r[0]}</th>
              {r.slice(1).map((c, i) => (
                <td key={i}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Rules() {
  const [asking, setAsking] = useState(false);
  const [said, setSaid] = useState('');
  return (
    <main className="wrap page" id="main" tabIndex={-1}>
      <div className="stack">
        <h1>House rules</h1>
        <p className="soft">This page reads the same policy file the checker uses, so it cannot say one thing while the site does another.</p>
      </div>
      <section className="stack">
        <h2>Rules in force</h2>
        <ul className={css.plain}>
          {policyLines().map((l) => (
            <li key={l}>{l}</li>
          ))}
          <li>A title must match at least {Math.round(POLICY.thresholds.titleMatch * 100)}% of its words.</li>
          <li>A year may differ by {POLICY.thresholds.yearTolerance}, because online and print dates differ.</li>
        </ul>
      </section>
      <section className="stack">
        <h2>Who does what</h2>
        <Table name="Agents" head={['Agent', 'Kind', 'Does', 'Cannot']} rows={AGENTS.map((a) => [a.name, a.kind === 'code' ? 'Plain code' : `AI, level ${a.minLevel} and up`, a.does, a.cannot])} />
      </section>
      <section className="stack">
        <h2>AI permission levels</h2>
        <ol start={0} className={css.plain}>
          {AI_LEVELS.map((l) => (
            <li key={l.level}>
              <strong>{l.name}.</strong> {l.means}
            </li>
          ))}
        </ol>
      </section>
      <section className="stack">
        <h2>Who is accountable</h2>
        <Table name="Accountability" head={['Who', 'Answers for']} rows={WHO} />
      </section>
      <section className="stack">
        <h2>How this follows the school’s policy</h2>
        <p className="soft">
          Our summary of SP Jain’s Academic Integrity Policy, version 2, 24 February 2026.{' '}
          <a href={POLICY_URL} target="_blank" rel="noreferrer">
            Read the policy itself
          </a>
          . Using Paper Trail does not make work compliant, and your assessment’s own instructions come first.
        </p>
        <Table name="School policy" head={['Clause', 'What it asks', 'What Paper Trail does']} rows={CLAUSES} />
      </section>
      <section className={css.two}>
        <div className="stack">
          <h2>What we can check</h2>
          <ul className={css.plain}>
            {CAN.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        <div className="stack">
          <h2>What we cannot</h2>
          <ul className={css.plain}>
            {CANNOT.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      </section>
      <section className="stack">
        <h2>What leaves this device</h2>
        <Table name="Data that leaves" head={['What', 'When and where']} rows={LEAVES} />
      </section>
      <section className={css.danger}>
        <h2>Delete everything</h2>
        <p>Removes every project, source, claim, draft and log entry from the library you have open now. Nobody else has a copy, so it cannot be undone. To remove an account as well, open Account.</p>
        {asking ? (
          <div className="row" role="alert">
            <button
              className="btn main"
              type="button"
              onClick={() =>
                void deleteEverything().then(
                  () => {
                    setAsking(false);
                    setSaid('Everything in this library was deleted.');
                  },
                  () => setSaid('That did not work. Your data is still here.'),
                )
              }
            >
              Yes, delete everything
            </button>
            <button className="btn" type="button" onClick={() => setAsking(false)}>
              Keep my data
            </button>
          </div>
        ) : (
          <button className="btn" type="button" onClick={() => { setSaid(''); setAsking(true); }}>
            Delete everything
          </button>
        )}
        <p role="status">{said}</p>
      </section>
    </main>
  );
}
