import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@/app/router';
import type { StepProps } from '@/app/ProjectShell';
import { checkDraft } from '@/core/cite/draft';
import { formatSources, isPage, STYLE_NAME, type StyleFiles } from '@/core/cite/engine';
import { loadStyle } from '@/core/cite/load';
import { exportSet, titleOf } from '@/core/cite/preflight';
import { CLAIM_TEXT, type CitationStyle, type Source } from '@/core/contracts';
import { record as log } from '@/log/log';
import { DraftCheck } from '@/pages/DraftCheck';
import { citable, setStyle } from '@/store/actions';
import { db } from '@/store/db';
import { ClaimStamp } from '@/ui/Stamp';
import css from './Write.module.css';

/** In-text citations for a set of sources. IEEE drafts carry author and year, and get numbers on export. */
function useInText(sources: Source[], style: CitationStyle): { map: Map<string, string>; failed: boolean; files: StyleFiles | null } {
  const [state, setState] = useState<{ map: Map<string, string>; failed: boolean; files: StyleFiles | null }>({ map: new Map(), failed: false, files: null });
  const key = sources.map((s) => `${s.id}${s.citeTitle ?? ''}`).join('|');
  useEffect(() => {
    let live = true;
    const st = style === 'ieee' ? 'apa' : style;
    loadStyle(st)
      .then((files) => live && setState({ map: formatSources(sources, st, files).inText, failed: false, files }))
      .catch(() => live && setState({ map: new Map(), failed: true, files: null }));
    return () => {
      live = false;
    };
  }, [key, style]);
  return state;
}

export function Write({ project }: StepProps) {
  const sources = useLiveQuery(() => db.sources.where('projectId').equals(project.id).toArray(), [project.id]);
  const claims = useLiveQuery(() => db.claims.where('projectId').equals(project.id).toArray(), [project.id]) ?? [];
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState<'yes' | 'saving' | 'failed'>('yes');
  const [picking, setPicking] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const caret = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    void db.drafts.get(project.id).then((d) => live && setText(d?.html ?? ''));
    return () => {
      live = false;
      clearTimeout(timer.current);
      if (latest.current !== null) void db.drafts.put({ id: project.id, projectId: project.id, html: latest.current, updatedAt: new Date().toISOString() });
    };
  }, [project.id]);

  function change(v: string) {
    setText(v);
    latest.current = v;
    setSaved('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      db.drafts
        .put({ id: project.id, projectId: project.id, html: v, updatedAt: new Date().toISOString() })
        .then(() => setSaved('yes'))
        .catch(() => setSaved('failed'));
    }, 500);
  }

  const ok = useMemo(() => exportSet(sources ?? []), [sources]);
  const { map: inText, failed, files } = useInText(ok, project.style);
  const check = useMemo(() => checkDraft(text ?? '', ok, sources ?? []), [text, ok, sources]);
  if (!sources || text === null) return <p className="soft">Opening your draft…</p>;

  /** The citation for one source, with a page when the student quotes from it. */
  const citeWith = (s: Source, page: string): string | null => {
    if (!page || !files) return inText.get(s.id) ?? null;
    const st = project.style === 'ieee' ? 'apa' : project.style;
    return formatSources(ok, st, files, page).inText.get(s.id) ?? null;
  };

  function insert(s: Source, page: string) {
    const cite = citeWith(s, page);
    if (!cite) return;
    const t = text ?? '';
    const at = Math.min(caret.current, t.length);
    const before = t.slice(0, at);
    const piece = `${before && !/\s$/.test(before) ? ' ' : ''}${cite}`;
    change(before + piece + t.slice(at));
    caret.current = at + piece.length;
    setPicking(false);
    void log(project.id, 'student', 'citation.inserted', `${cite} ${titleOf(s)}`);
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(caret.current, caret.current);
    });
  }

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const accepted = claims.filter((c) => c.decision === 'accepted' || c.decision === 'rewritten');

  return (
    <>
      <div className="stack">
        <h1>Write</h1>
        <p className="soft">You write it, in your own words. Paper Trail only adds citations from your library and tells you when one does not match.</p>
      </div>
      <div className={css.split}>
        <div className="stack">
          <div className={css.tools}>
            <button
              className="btn main"
              type="button"
              aria-expanded={picking}
              disabled={ok.length === 0}
              onClick={() => {
                caret.current = area.current?.selectionStart ?? text.length;
                setPicking(!picking);
              }}
            >
              Cite
            </button>
            <label className={css.style}>
              <span>Style</span>
              <select value={project.style} onChange={(e) => void setStyle(project.id, e.target.value as CitationStyle)}>
                {Object.entries(STYLE_NAME).map(([k, n]) => (
                  <option key={k} value={k}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <span className="soft" role="status">
              {words} {words === 1 ? 'word' : 'words'} · {saved === 'yes' ? 'saved on this device' : saved === 'saving' ? 'saving…' : 'could not save: this browser is blocking storage'}
            </span>
          </div>
          {picking && <Picker sources={ok} inText={inText} onPick={insert} onClose={() => { setPicking(false); area.current?.focus(); }} />}
          {project.style === 'ieee' && <p className="soft">IEEE numbers depend on the order you cite. Your draft shows author and year, and the Word file turns them into [1], [2].</p>}
          {failed && <p role="alert" className={css.warn}>The citation style did not load, so nothing can be inserted yet. Check your connection and reload.</p>}
          <label className="sr" htmlFor="draft">
            Your draft
          </label>
          <textarea id="draft" ref={area} className={css.page} value={text} onChange={(e) => change(e.target.value)} placeholder="Start writing. Press Cite to add a source from your library." spellCheck lang="en-GB" />
        </div>
        <aside className={css.margin} aria-label="Citation checks">
          {ok.length === 0 && (
            <p className="soft">
              Nothing is ready to cite. <Link to={`/p/${project.id}/library`}>Approve sources in your library</Link> first.
            </p>
          )}
          {check.unknown.length > 0 && (
            <section>
              <h2>Not in your library ({check.unknown.length})</h2>
              <ul className={css.bad}>
                {check.unknown.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
              <p className="soft">Add the source, or take the citation out.</p>
            </section>
          )}
          {check.notCitable.length > 0 && (
            <section>
              <h2>In your library, not approved ({check.notCitable.length})</h2>
              <ul className={css.warnList}>
                {check.notCitable.map((x) => (
                  <li key={x.source.id}>{x.text}</li>
                ))}
              </ul>
              <Link to={`/p/${project.id}/library`}>Decide in the library</Link>
            </section>
          )}
          <section>
            <h2>Cited ({check.cited.length})</h2>
            {check.cited.length === 0 && <p className="soft">No citations yet.</p>}
            <ul>
              {check.cited.map((c) => (
                <li key={c.source.id}>
                  {titleOf(c.source)} <span className="soft">{c.times > 1 ? `${c.times} times` : 'once'}</span>
                  {c.source.keptWithReason && <small className={css.note}>Kept with your reason</small>}
                </li>
              ))}
            </ul>
          </section>
          {check.neverCited.length > 0 && (
            <section>
              <h2>Never cited ({check.neverCited.length})</h2>
              <ul>
                {check.neverCited.map((s) => (
                  <li key={s.id}>{titleOf(s)}</li>
                ))}
              </ul>
            </section>
          )}
          {accepted.length > 0 && (
            <section>
              <h2>Claims you accepted</h2>
              <ul>
                {accepted.map((c) => (
                  <li key={c.id}>
                    {c.text} <ClaimStamp label={c.label} />
                    <small className={css.note}>{CLAIM_TEXT[c.label].plain}</small>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
      <DraftCheck project={project} text={text} sources={sources} cite={citeWith} onChange={change} area={area} />
      <div className={css.gate}>
        <p>When you are done, export the reference list. Only approved sources leave.</p>
        <Link to={`/p/${project.id}/export`} className="btn main">
          Go to export
        </Link>
      </div>
    </>
  );
}

function Picker({ sources, inText, onPick, onClose }: { sources: Source[]; inText: Map<string, string>; onPick: (s: Source, page: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState('');
  const badPage = !!page.trim() && !isPage(page);
  const pick = (s: Source) => {
    if (!badPage) onPick(s, page.trim());
  };
  const [at, setAt] = useState(0);
  const list = sources.filter((s) => citable(s) && q.toLowerCase().split(/\s+/).every((w) => `${titleOf(s)} ${inText.get(s.id) ?? ''} ${s.tags.join(' ')}`.toLowerCase().includes(w))).slice(0, 8);
  const now = Math.min(at, Math.max(0, list.length - 1));
  return (
    <div className={`card ${css.picker}`}>
      <label className="sr" htmlFor="cite-search">
        Search your library to cite
      </label>
      <input
        id="cite-search"
        className="field"
        autoFocus
        role="combobox"
        aria-expanded="true"
        aria-controls="cite-list"
        aria-activedescendant={list[now] ? `cite-${list[now]!.id}` : undefined}
        value={q}
        placeholder="Author, title or tag"
        onChange={(e) => {
          setQ(e.target.value);
          setAt(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'ArrowDown') { e.preventDefault(); setAt(Math.min(now + 1, list.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setAt(Math.max(now - 1, 0)); }
          if (e.key === 'Enter' && list[now]) { e.preventDefault(); pick(list[now]!); }
        }}
      />
      <ul id="cite-list" role="listbox" aria-label="Sources you can cite" className={css.options}>
        {list.map((s, i) => (
          <li key={s.id} id={`cite-${s.id}`} role="option" aria-selected={i === now} onMouseEnter={() => setAt(i)} onClick={() => pick(s)}>
            <strong>{inText.get(s.id) ?? 'Formatting…'}</strong> {titleOf(s)}
          </li>
        ))}
      </ul>
      <label className={css.pageBox}>
        <span>Page, if you are quoting</span>
        <input className="field" value={page} onChange={(e) => setPage(e.target.value)} placeholder="167 or 167-168" aria-invalid={badPage} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter' && list[now]) { e.preventDefault(); pick(list[now]!); } }} />
      </label>
      {badPage && <p role="alert" className={css.warn}>Write the page as 167, 167-168 or e12.</p>}
      {list.length === 0 && <p className="soft">Nothing in your library matches. Only approved sources can be cited.</p>}
    </div>
  );
}
