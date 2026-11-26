import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link } from '@/app/router';
import type { StepProps } from '@/app/ProjectShell';
import { checkDraft } from '@/core/cite/draft';
import { formatSources, LIST_HEADING, STYLE_NAME, type Formatted, type StyleFiles } from '@/core/cite/engine';
import { saveFile, toBibtex, toDocx, toRis, toText } from '@/core/cite/export';
import { loadStyle } from '@/core/cite/load';
import { preflight, reasonNotes, titleOf } from '@/core/cite/preflight';
import type { CitationStyle } from '@/core/contracts';
import { statementLines } from '@/core/report/statement';
import { claimTrail, trailLines } from '@/core/report/trail';
import { record as log } from '@/log/log';
import { AiStatement } from '@/pages/AiStatement';
import { setStyle } from '@/store/actions';
import { db } from '@/store/db';
import { ClaimStamp, SourceStamp } from '@/ui/Stamp';
import css from './Export.module.css';

export function Export({ project }: StepProps) {
  const sources = useLiveQuery(() => db.sources.where('projectId').equals(project.id).toArray(), [project.id]);
  const draft = useLiveQuery(async () => (await db.drafts.get(project.id))?.html ?? '', [project.id]) ?? '';
  const events = useLiveQuery(() => db.log.where('projectId').equals(project.id).sortBy('seq'), [project.id]) ?? [];
  const claims = useLiveQuery(() => db.claims.where('projectId').equals(project.id).toArray(), [project.id]) ?? [];
  const [onlyCited, setOnlyCited] = useState(false);
  const [withDraft, setWithDraft] = useState(true);
  const [withTrail, setWithTrail] = useState(true);
  const [files, setFiles] = useState<{ style: CitationStyle; f: StyleFiles } | null>(null);
  const [failed, setFailed] = useState(false);
  const [said, setSaid] = useState('');
  const style = project.style;

  useEffect(() => {
    let live = true;
    setFailed(false);
    loadStyle(style)
      .then((f) => live && setFiles({ style, f }))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [style]);

  const p = useMemo(() => preflight(sources ?? []), [sources]);
  const all = useMemo(() => [...p.ready, ...p.withReason], [p]);
  const drafted = useMemo(() => checkDraft(draft, all, sources ?? []), [draft, all, sources]);
  const list = useMemo(() => (onlyCited ? drafted.cited.map((c) => c.source) : all), [onlyCited, drafted, all]);
  const out: Formatted | null = useMemo(() => (files && files.style === style && list.length ? formatSources(list, style, files.f) : null), [files, style, list]);
  const trail = useMemo(() => claimTrail(claims, sources ?? []), [claims, sources]);

  if (!sources) return <p className="soft">Opening your library…</p>;

  async function leave(kind: string, go: () => void | Promise<void>) {
    try {
      await go();
      await log(project.id, 'student', 'export', `${kind}, ${STYLE_NAME[style]}, ${list.length} sources${p.withReason.filter((s) => list.includes(s)).length ? `, ${p.withReason.filter((s) => list.includes(s)).length} kept with a reason` : ''}, ${p.blocked.length} left out`);
      setSaid(`${kind} ready.`);
    } catch (e) {
      setSaid(e instanceof Error ? e.message : 'That did not work.');
    }
  }

  const notes = reasonNotes(list);
  return (
    <>
      <div className="stack">
        <h1>Export</h1>
        <p className="soft">Nothing leaves without its three keys. A flagged source leaves only with the reason you wrote, printed beside it.</p>
      </div>

      <section className={css.flight} aria-label="Pre-flight">
        <div data-kind="ready">
          <strong>{p.ready.length}</strong> ready, all three keys
        </div>
        <div data-kind="reason">
          <strong>{p.withReason.length}</strong> kept with your reason
        </div>
        <div data-kind="blocked">
          <strong>{p.blocked.length}</strong> stay behind
        </div>
      </section>
      {p.blocked.length > 0 && (
        <section className="stack">
          <h2>What stays behind, and why</h2>
          <ul className={css.blocked}>
            {p.blocked.map((b) => (
              <li key={b.source.id}>
                <strong>{titleOf(b.source)}</strong>
                <SourceStamp s={b.source} />
                <span>{b.why.join(' ')}</span>
              </li>
            ))}
          </ul>
          <Link to={`/p/${project.id}/library`}>Decide in the library</Link>
        </section>
      )}
      {drafted.unknown.length > 0 && (
        <p role="alert" className={css.warn}>
          Your draft cites {drafted.unknown.join('; ')}, which {drafted.unknown.length === 1 ? 'is' : 'are'} not in your library.
        </p>
      )}
      {p.titles.filter((t) => list.includes(t.source)).length > 0 && (
        <details>
          <summary>{p.titles.filter((t) => list.includes(t.source)).length === 1 ? '1 title has' : `${p.titles.filter((t) => list.includes(t.source)).length} titles have`} capitals only you can judge</summary>
          <ul>
            {p.titles.filter((t) => list.includes(t.source)).map((t) => (
              <li key={t.source.id}>
                {titleOf(t.source)} <span className="soft">Look at: {t.words.join(', ')}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <section className="stack">
        <div className={css.tools}>
          <label>
            <span>Style</span>
            <select value={style} onChange={(e) => void setStyle(project.id, e.target.value as CitationStyle)}>
              {Object.entries(STYLE_NAME).map(([k, n]) => (
                <option key={k} value={k}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={onlyCited} disabled={drafted.cited.length === 0} onChange={(e) => setOnlyCited(e.target.checked)} />
            <span>Only what my draft cites ({drafted.cited.length})</span>
          </label>
          <label>
            <input type="checkbox" checked={withDraft} disabled={!draft.trim()} onChange={(e) => setWithDraft(e.target.checked)} />
            <span>Put my draft in the Word file</span>
          </label>
          <label>
            <input type="checkbox" checked={withTrail} disabled={trail.length === 0} onChange={(e) => setWithTrail(e.target.checked)} />
            <span>Add my claims and their sources ({trail.length})</span>
          </label>
        </div>
        {failed && (
          <p role="alert" className={css.warn}>
            The citation style did not load. Check your connection and choose the style again. BibTeX and RIS still work.
          </p>
        )}
        {list.length === 0 ? (
          <div className={`card ${css.empty}`}>
            <h2>Nothing to export yet</h2>
            <p className="soft">
              Approve at least one source in <Link to={`/p/${project.id}/library`}>your library</Link>.
            </p>
          </div>
        ) : (
          <>
            <div className={css.sheet} aria-label="Reference list preview">
              <h2>{LIST_HEADING[style]}</h2>
              {!out && !failed && <p className="soft">Formatting…</p>}
              {out?.entries.map((e) => {
                const s = list.find((x) => x.id === e.id);
                return (
                  <div key={e.id} className={css.row}>
                    <p className={css.entry} data-numbered={!!e.label}>
                      {e.label && <span className={css.num}>{e.label}</span>}
                      {e.runs.map((r, i) => (r.italic ? <i key={i}>{r.text}</i> : r.bold ? <b key={i}>{r.text}</b> : <span key={i}>{r.text}</span>))}
                    </p>
                    {s && (
                      <span className={css.trust}>
                        <SourceStamp s={s} /> {s.keptWithReason ? 'Kept with your reason' : 'Approved by you'}
                      </span>
                    )}
                  </div>
                );
              })}
              <p className={css.trust}>The labels are for you. They are not in the list you copy or download.</p>
              {notes.length > 0 && (
                <div className={css.notes}>
                  <h3>Notes on sources</h3>
                  {notes.map((n) => (
                    <p key={n}>{n}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="row">
              <button className="btn main" type="button" disabled={!out} onClick={() => void leave('Word file', async () => {
                const { Packer } = await import('docx');
                const doc = await toDocx({ sources: list, style, files: files!.f, question: project.question, statement: statementLines(events, project), ...(withDraft && draft.trim() ? { draft } : {}), ...(withTrail && trail.length ? { trail: trail.map(trailLines) } : {}) });
                saveFile('paper-trail.docx', await Packer.toBlob(doc));
              })}>
                Word
              </button>
              <button className="btn" type="button" disabled={!out} onClick={() => void leave('Copied list', () => navigator.clipboard.writeText(toText(list, style, files!.f)))}>
                Copy
              </button>
              <button className="btn" type="button" disabled={!out} onClick={() => void leave('Text file', () => saveFile('references.txt', toText(list, style, files!.f)))}>
                Plain text
              </button>
              <button className="btn" type="button" onClick={() => void leave('BibTeX file', () => saveFile('references.bib', toBibtex(list)))}>
                BibTeX
              </button>
              <button className="btn" type="button" onClick={() => void leave('RIS file', () => saveFile('references.ris', toRis(list)))}>
                RIS
              </button>
              <button className="btn" type="button" onClick={() => void leave('Evidence report', async () => {
                const m = await import('@/core/report/report');
                m.download('evidence-report.html', await m.projectReport(project));
              })}>
                Evidence report
              </button>
              <span role="status" className="soft">
                {said}
              </span>
            </div>
          </>
        )}
      </section>

      <section className="stack" aria-labelledby="trail">
        <h2 id="trail">Claims and their sources ({trail.length})</h2>
        {trail.length === 0 ? (
          <p className="soft">
            Claims you accept in <Link to={`/p/${project.id}/evidence`}>Evidence</Link> appear here with the exact words of their source, and go into the Word file.
          </p>
        ) : (
          <ul className={css.trail}>
            {trail.map((r) => (
              <li key={r.id}>
                <p>
                  <strong>{r.claim}</strong> <ClaimStamp label={r.label} />
                  {r.decision === 'rewritten' && <small className="soft"> rewritten by you</small>}
                </p>
                {r.quote ? (
                  <blockquote>
                    “{r.quote}”
                    <small>{[r.source, r.where].filter(Boolean).join(' · ')}</small>
                  </blockquote>
                ) : (
                  <p className="soft">No sentence in a source was found for this claim.</p>
                )}
                {r.reason && <p className="soft">Your reason for keeping it: {r.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack">
        <h2>What was not checked</h2>
        <ul className={css.plain}>
          {p.notChecked.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </section>
      <AiStatement project={project} />
    </>
  );
}
