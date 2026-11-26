import { useState } from 'react';
import { checkQuote, classify, prepareNote, research, type NoteAnswer, type QuoteAnswer, type ResearchAnswer, type Candidate } from '@/agents/assistant';
import type { Project, Source } from '@/core/contracts';
import { registries } from '@/core/registries';
import { withFreshAnswers } from '@/core/registries/http';
import { cleanTitle } from '@/core/verify/normalise';
import { record as log } from '@/log/log';
import { saveNote } from '@/store/decisions';
import css from './Decisions.module.css';

type Out = ResearchAnswer | QuoteAnswer | NoteAnswer | { kind: 'error'; text: string };

function Cand({ c }: { c: Candidate }) {
  const r = c.check.record ?? c.record;
  return (
    <li>
      <strong>[{c.status}]</strong> {r.authors.slice(0, 3).map((a) => a.family).join(', ')}{r.authors.length > 3 ? ' et al.' : ''} ({r.year ?? 'n.d.'}). {cleanTitle(r.title)}. <i>{r.container}</i>.{' '}
      {r.doi && <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noreferrer">doi:{r.doi}</a>}
      <br />
      <span className="soft">{c.why} Checked by: {[...new Set(c.check.trace.map((t) => t.registry))].join(', ')}.</span>
    </li>
  );
}

/**
 * Phase 2 research assistant. Searches Crossref and OpenAlex, checks every candidate with the Checker,
 * checks quotes against text it can actually read, and saves notes as plain text. No AI writes any of it.
 */
export function Assistant({ project, sources }: { project: Project; sources: Source[] }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Out | null>(null);
  const [noteSaid, setNoteSaid] = useState('');

  async function go(e: React.FormEvent) {
    e.preventDefault();
    const text = q.trim();
    if (!text) return;
    setBusy(true);
    setOut(null);
    setNoteSaid('');
    const kind = classify(text);
    try {
      if (kind === 'note') setOut(prepareNote(text, sources));
      else if (kind === 'quote') setOut(await withFreshAnswers(() => checkQuote(text, sources, { registries })));
      else setOut(await withFreshAnswers(() => research(text, { registries })));
      await log(project.id, 'student', `assistant.${kind === 'library' ? 'research' : kind}`, text.slice(0, 300));
    } catch (x) {
      setOut({ kind: 'error', text: x instanceof Error ? x.message : 'That did not work.' });
    }
    setBusy(false);
  }

  return (
    <section className="stack" aria-label="Research assistant">
      <h2>Research assistant</h2>
      <p className="soft">Ask for studies, check a quote, or save a note. It searches Crossref and OpenAlex and checks every result with the Checker. It never writes an author, title, year, DOI or finding, and never makes up a source to reach the number you asked for.</p>
      <form className="stack" onSubmit={(e) => void go(e)}>
        <label htmlFor="assist-q"><strong>Your request</strong></label>
        <textarea id="assist-q" className="field" rows={3} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Give me three peer-reviewed studies that…  ·  Check this quote: '…' (Author, 2015)  ·  Save this note on the … paper: '…'" />
        <div className="row">
          <button className="btn main" type="submit" disabled={busy || q.trim().length < 6}>{busy ? 'Searching and checking…' : 'Ask the assistant'}</button>
        </div>
      </form>
      {out?.kind === 'error' && <p role="alert">{out.text}</p>}
      {out?.kind === 'research' && (
        <div className={css.panel} data-kind={out.verdict === 'NOT FOUND' ? 'mismatch' : 'fix'} role="status">
          <h3>{out.verdict === 'NOT FOUND' ? 'NOT FOUND: no matching study could be verified' : `FOUND: ${out.direct.length} direct`}</h3>
          <p>{out.note}</p>
          <h4>Direct evidence</h4>
          {out.direct.length ? <ul>{out.direct.map((c) => <Cand key={c.record.id} c={c} />)}</ul> : <p className="soft">None. {out.specific.length ? `No record names ${out.specific.join(', ')}.` : ''}</p>}
          {out.related.length > 0 && (
            <>
              <h4>Related research (not evidence for your specific claim)</h4>
              <ul>{out.related.map((c) => <Cand key={c.record.id} c={c} />)}</ul>
            </>
          )}
          <details>
            <summary>Where we searched ({out.searched.length})</summary>
            <ul>{out.searched.map((s, i) => <li key={i}><span className="mono">{new Date(s.at).toLocaleTimeString('en-GB')}</span> {s.registry}: “{s.query}”: {s.outcome}</li>)}</ul>
          </details>
        </div>
      )}
      {out?.kind === 'quote' && (
        <div className={css.panel} data-kind={out.verdict === 'QUOTE FOUND' ? 'fix' : 'mismatch'} role="status">
          <h3>{out.verdict}</h3>
          <p>“{out.quote}” <span className="soft">cited as ({out.cited})</span></p>
          {out.paper && <p>Cited paper: <strong>{out.paper.title}</strong> [{out.paper.status}], {out.paper.from === 'library' ? 'from your library' : 'found in Crossref and checked'}. Text we could read: {out.read}.</p>}
          <p>{out.note}</p>
          {out.searched.length > 0 && <p className="soft">Searched: {out.searched.map((s) => `${s.registry} “${s.query}” (${s.outcome})`).join('; ')}</p>}
        </div>
      )}
      {out?.kind === 'note' && (
        <div className={css.panel} data-kind={out.flagged.length ? 'mismatch' : 'fix'} role="status">
          <h3>Save a note{out.target ? ` on “${cleanTitle(out.target.record?.title ?? out.target.raw?.title ?? '')}”` : ''}</h3>
          <p className="mono">{out.note}</p>
          {out.flagged.length > 0 && (
            <p><strong>This note reads like an instruction to an AI</strong> ({out.flagged.map((f) => `“${f}”`).join(', ')}). It is your text, so it can be saved, but only as plain text. It cannot change a status, a rule, a permission or any other reference.</p>
          )}
          {out.target ? (
            <button className="btn" type="button" disabled={!!noteSaid} onClick={() => void saveNote(out.target!.id, [out.target!.notes, out.note].filter(Boolean).join('\n')).then((r) => setNoteSaid(`Saved as plain text. Status before: ${r.statusBefore}. Status after: ${r.statusAfter}. No other reference changed.`))}>
              Save as plain note
            </button>
          ) : (
            <p>No source in your library matches “{out.hint}”. Add the paper first.</p>
          )}
          {noteSaid && <p>{noteSaid}</p>}
        </div>
      )}
    </section>
  );
}
