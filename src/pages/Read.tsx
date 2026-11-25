import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { go, Link } from '@/app/router';
import type { StepProps } from '@/app/ProjectShell';
import { readPassages } from '@/agents/reader';
import { compareTexts, PARTS, readPaper, toCsv, type Part } from '@/core/analyst/analyst';
import { citeKey } from '@/core/cite/csl';
import { saveFile } from '@/core/cite/save';
import { titleOf } from '@/core/cite/preflight';
import { VERDICT_TEXT, type Source } from '@/core/contracts';
import { pageAt, pageText } from '@/core/pdf/pages';
import { registries } from '@/core/registries';
import { record as log } from '@/log/log';
import { agentAllowed } from '@/policy/policy';
import { editSource } from '@/store/actions';
import { db } from '@/store/db';
import { VerdictStamp } from '@/ui/Stamp';
import css from './Read.module.css';

/** Carries a sentence to Evidence, where it is checked like any other claim. */
export const CLAIM_HANDOFF = 'pt-claim';

const label = (s: Source): string => {
  const k = citeKey(s);
  return `${k.family || 'No author'}${k.all.length > 1 ? ' et al.' : ''}, ${k.year ?? 'n.d.'}`;
};

export function Read({ project }: StepProps) {
  const sources = useLiveQuery(() => db.sources.where('projectId').equals(project.id).toArray(), [project.id]);
  const [tab, setTab] = useState<'one' | 'many'>('one');
  if (!sources) return <p className="soft">Opening your library…</p>;
  return (
    <>
      <div className="stack">
        <h1>Read and compare</h1>
        <p className="soft">The Analyst sorts a paper’s own sentences into what it asked, did, found and left open. Every line is the paper’s exact words. It writes nothing, so it cannot add a finding.</p>
      </div>
      {sources.length === 0 ? (
        <div className={`card ${css.empty}`}>
          <h2>No papers to read yet</h2>
          <p className="soft">
            <Link to={`/p/${project.id}/find`}>Keep a source</Link> or <Link to={`/p/${project.id}/library`}>add one to your library</Link>.
          </p>
        </div>
      ) : (
        <>
          <div className={css.tabs} role="group" aria-label="View">
            <button type="button" aria-pressed={tab === 'one'} onClick={() => setTab('one')}>
              Read one paper
            </button>
            <button type="button" aria-pressed={tab === 'many'} onClick={() => setTab('many')}>
              Compare papers
            </button>
          </div>
          {tab === 'one' ? <One project={project} sources={sources} /> : <Many project={project} sources={sources} />}
        </>
      )}
    </>
  );
}

function One({ project, sources }: StepProps & { sources: Source[] }) {
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [only, setOnly] = useState<Part | 'all'>('all');
  const [ai, setAi] = useState<{ model: string; lines: string[] } | string | null>(null);
  const s = sources.find((x) => x.id === id) ?? sources.find((x) => x.text) ?? sources[0]!;
  const reading = useMemo(() => (s.text ? readPaper(s.text) : null), [s.text]);
  const mayAsk = agentAllowed('reader', project.aiLevel);

  async function getText() {
    setBusy(true);
    setError('');
    try {
      const rec = s.record?.doi ? await registries.openalexByDoi(s.record.doi) : null;
      if (rec?.abstract) await editSource(s.id, { text: rec.abstract, textOrigin: 'abstract' });
      else setError('OpenAlex has no abstract for this paper. Add its PDF in the library.');
    } catch {
      setError('OpenAlex did not answer. Try again in a minute, or add the PDF.');
    }
    setBusy(false);
  }
  async function keep(text: string, at: { start: number; end: number }) {
    const p = pageAt(s, at.start, at.end);
    const line = `“${text}”${p ? ` (${pageText(p)})` : ''}`;
    if (!s.notes.includes(`“${text}”`)) await editSource(s.id, { notes: [s.notes, line].filter(Boolean).join('\n') });
    setSaved(text);
  }
  function claim(text: string) {
    try {
      sessionStorage.setItem(CLAIM_HANDOFF, JSON.stringify({ sourceId: s.id, text }));
    } catch {
      /* storage blocked: Evidence opens empty */
    }
    go(`/p/${project.id}/evidence`);
  }
  async function askReader() {
    setBusy(true);
    const p = PARTS.find((x) => x.key === only);
    const r = await readPassages(project, p ? p.ask : 'What did this paper find, and how?', [s]);
    setBusy(false);
    setAi(r.ok ? (r.data.length ? { model: r.model, lines: r.data.map((x) => x.text) } : 'The AI Reader pointed at nothing.') : r.reason === 'cap' ? 'This project has used all its AI calls.' : 'The AI Reader is not available. The sorting on this page uses no AI.');
  }

  const groups = PARTS.filter((p) => only === 'all' || p.key === only);
  return (
    <div className="stack">
      <div className={css.bar}>
        <label>
          <span>Paper</span>
          <select className="field" value={s.id} onChange={(e) => { setId(e.target.value); setAi(null); setError(''); setSaved(''); }}>
            {sources.map((x) => (
              <option key={x.id} value={x.id}>
                {titleOf(x).slice(0, 110)}
                {x.text ? '' : ' (no text yet)'}
              </option>
            ))}
          </select>
        </label>
        {s.check && <VerdictStamp verdict={s.check.verdict} />}
        {s.record?.doi && (
          <a href={`https://doi.org/${s.record.doi}`} target="_blank" rel="noreferrer">
            Open the source
          </a>
        )}
      </div>
      {!reading ? (
        <div className={css.notext}>
          <p>We have no text for this paper yet.</p>
          <div className="row">
            {s.record?.doi && (
              <button className="btn" type="button" disabled={busy} onClick={() => void getText()}>
                {busy ? 'Asking OpenAlex…' : 'Get the abstract'}
              </button>
            )}
            <Link to={`/p/${project.id}/library`}>Add its PDF in the library</Link>
          </div>
        </div>
      ) : (
        <>
          <div className={css.chips} role="group" aria-label="Show">
            <button type="button" aria-pressed={only === 'all'} onClick={() => setOnly('all')}>
              Everything
            </button>
            {PARTS.map((p) => (
              <button key={p.key} type="button" aria-pressed={only === p.key} onClick={() => setOnly(p.key)}>
                {p.ask}
              </button>
            ))}
          </div>
          <p className="soft" role="status">
            {reading.placed} of {reading.total} sentences sorted{s.textOrigin === 'abstract' ? ', from the abstract only' : ''}. {reading.ignored ? `${reading.ignored} aimed at an AI were left out. ` : ''}
            {saved ? 'Passage saved to your notes.' : ''}
          </p>
          <dl className={css.parts}>
            {groups.map((p) => (
              <div key={p.key} className="card">
                <dt>{p.title}</dt>
                {reading.parts[p.key].length === 0 ? (
                  <dd className={css.none}>Not found. {p.none}</dd>
                ) : (
                  reading.parts[p.key].map((x) => (
                    <dd key={x.start}>
                      <blockquote>
                        “{x.text}”{pageAt(s, x.start, x.end) && <small className="soft"> {pageText(pageAt(s, x.start, x.end)!)}</small>}
                      </blockquote>
                      <div className="row">
                        <button className="btn quiet" type="button" onClick={() => void keep(x.text, x)}>
                          {s.notes.includes(`“${x.text}”`) ? 'In your notes' : 'Save passage'}
                        </button>
                        <button className="btn quiet" type="button" onClick={() => claim(x.text)}>
                          Check in Evidence
                        </button>
                      </div>
                    </dd>
                  ))
                )}
              </div>
            ))}
          </dl>
          {mayAsk && (
            <div className="stack">
              <button className={`btn ${css.ai}`} type="button" disabled={busy} onClick={() => void askReader()}>
                {busy ? 'Asking…' : 'Ask the AI Reader to point'}
              </button>
              {typeof ai === 'string' && <p className="soft" role="status">{ai}</p>}
              {ai && typeof ai !== 'string' && (
                <div className={`card ${css.aiBox}`}>
                  <p className="soft">Chosen by number by {ai.model}. The words are the paper’s.</p>
                  {ai.lines.map((l) => (
                    <blockquote key={l}>“{l}”</blockquote>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className={css.error}>
          {error}
        </p>
      )}
    </div>
  );
}

function Many({ project, sources }: StepProps & { sources: Source[] }) {
  const readable = sources.filter((s) => s.text);
  const [picked, setPicked] = useState<string[]>(() => readable.slice(0, 3).map((s) => s.id));
  const chosen = readable.filter((s) => picked.includes(s.id));
  const rows = useMemo(() => compareTexts(chosen), [picked, sources]);
  const [said, setSaid] = useState('');
  const meta: [string, (s: Source) => string][] = [
    ['Published', (s) => [citeKey(s).year ?? 'year not stated', s.record?.container].filter(Boolean).join(', ')],
    ['Check', (s) => (s.check ? VERDICT_TEXT[s.check.verdict].label : 'Not checked')],
    ['Cited by', (s) => (s.record?.citedBy !== undefined ? String(s.record.citedBy) : 'not stated')],
    ['Read from', (s) => (s.textOrigin === 'abstract' ? 'the abstract' : s.textOrigin === 'pdf' ? 'your PDF' : 'the text')],
  ];
  if (readable.length < 2)
    return (
      <p className="soft">
        You need two papers with text to compare. <Link to={`/p/${project.id}/find`}>Find more</Link>, or get their abstracts on the first tab.
      </p>
    );
  return (
    <div className="stack">
      <fieldset className={css.pick}>
        <legend>Compare up to four</legend>
        {readable.map((s) => (
          <label key={s.id}>
            <input type="checkbox" checked={picked.includes(s.id)} disabled={!picked.includes(s.id) && chosen.length >= 4} onChange={(e) => setPicked((c) => (e.target.checked ? [...c, s.id] : c.filter((x) => x !== s.id)))} /> <span>{titleOf(s)}</span>
          </label>
        ))}
      </fieldset>
      {chosen.length < 2 ? (
        <p className="soft">Choose at least two.</p>
      ) : (
        <>
          <div className={css.scroll} role="region" aria-label="Comparison" tabIndex={0}>
            <table style={{ minWidth: 180 + chosen.length * 250 }}>
              <thead>
                <tr>
                  <td />
                  {chosen.map((s) => (
                    <th key={s.id} scope="col">
                      {titleOf(s)}
                      <small>{label(s)}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {meta.map(([name, of]) => (
                  <tr key={name}>
                    <th scope="row">{name}</th>
                    {chosen.map((s) => (
                      <td key={s.id}>{of(s)}</td>
                    ))}
                  </tr>
                ))}
                {rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row">{r.label}</th>
                    {r.cells.map((c, i) => (
                      <td key={chosen[i]!.id} data-none={!c.length}>
                        {c.length ? c.map((x) => <p key={x}>“{x}”</p>) : 'Not stated'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button
              className="btn"
              type="button"
              onClick={() => {
                saveFile('comparison.csv', `﻿${toCsv(['', ...chosen.map((s) => titleOf(s))], [...meta.map(([name, of]) => [name, ...chosen.map(of)]), ...rows.map((r) => [r.label, ...r.cells.map((c) => c.join(' ') || 'Not stated')])])}`, 'text/csv;charset=utf-8');
                void log(project.id, 'student', 'analyst.compared', `${chosen.length} papers`);
                setSaid('Comparison saved as a spreadsheet file.');
              }}
            >
              Download as a spreadsheet
            </button>
            <span role="status" className="soft">
              {said}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
