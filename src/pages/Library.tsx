import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useId, useState } from 'react';
import { Link } from '@/app/router';
import type { StepProps } from '@/app/ProjectShell';
import { citeKey } from '@/core/cite/csl';
import { titleOf } from '@/core/cite/preflight';
import { sentenceCase } from '@/core/cite/sentenceCase';
import { VERDICT_TEXT, type RawReference, type Source, type Verdict } from '@/core/contracts';
import { addChecked, addWebPage, refFromLine, refsFromFile, webProblems, type WebPage } from '@/core/import/import';
import { checkAgain } from '@/core/library/watch';
import { cleanTitle } from '@/core/verify/normalise';
import { sourceIssues } from '@/policy/apply';
import { POLICY } from '@/policy/policy';
import { Duplicates, RetractionCheck } from '@/pages/LibraryChecks';
import { approveSource, citable, editSource, removeSource } from '@/store/actions';
import { db } from '@/store/db';
import { PdfDrop } from '@/ui/PdfDrop';
import { Receipt } from '@/ui/Receipt';
import { Stamp, VerdictStamp } from '@/ui/Stamp';
import css from './Library.module.css';

type Status = 'all' | 'citable' | 'waiting';
type Sort = 'newest' | 'author' | 'year' | 'title';

const by = (s: Source): string => {
  const a = s.record?.authors.map((x) => x.family) ?? s.raw?.authors ?? [];
  return a.length ? `${a.slice(0, 3).join(', ')}${a.length > 3 ? ' et al.' : ''}` : 'No author listed';
};
/** The year that will be cited. A paper online in 2014 and in a 2015 issue is 2015. */
const yearOf = (s: Source): number | undefined => citeKey(s).year;
const isClean = (s: Source): boolean => s.keys.found && s.keys.checked && !sourceIssues(s).length;

/** The three keys, as words and not only as marks. */
export function KeyRow({ s }: { s: Source }) {
  const k: [string, boolean][] = [['Found', s.keys.found], ['Checked', s.keys.checked], ['Approved', s.keys.approved]];
  return (
    <ul className={css.keys} aria-label="Keys">
      {k.map(([n, on]) => (
        <li key={n} data-on={on}>
          <span aria-hidden="true">{on ? '●' : '○'}</span> {n}
          <span className="sr">{on ? ': yes' : ': no'}</span>
        </li>
      ))}
    </ul>
  );
}

function SourceMark({ s }: { s: Source }) {
  if (s.check) return <VerdictStamp verdict={s.check.verdict} />;
  return (
    <Stamp tone="mute" mark="~">
      {s.origin === 'web' ? 'Web page, not checked' : 'Not checked'}
    </Stamp>
  );
}

export function Library({ project }: StepProps) {
  const sources = useLiveQuery(() => db.sources.where('projectId').equals(project.id).toArray(), [project.id]);
  const [q, setQ] = useState('');
  const [verdict, setVerdict] = useState<'all' | Verdict | 'none'>('all');
  const [status, setStatus] = useState<Status>('all');
  const [folder, setFolder] = useState('all');
  const [tag, setTag] = useState('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  if (!sources) return <p className="soft">Opening your library…</p>;

  const folders = [...new Set(sources.map((s) => s.folder).filter((f): f is string => !!f))].sort();
  const tags = [...new Set(sources.flatMap((s) => s.tags))].sort();
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = sources
    .filter((s) => {
      const hay = [titleOf(s), by(s), yearOf(s), s.record?.container, s.record?.doi, s.notes, s.tags.join(' '), s.folder].join(' ').toLowerCase();
      return (
        words.every((w) => hay.includes(w)) &&
        (verdict === 'all' || (verdict === 'none' ? !s.check : s.check?.verdict === verdict)) &&
        (status === 'all' || (status === 'citable') === citable(s)) &&
        (folder === 'all' || (folder === 'none' ? !s.folder : s.folder === folder)) &&
        (tag === 'all' || s.tags.includes(tag))
      );
    })
    .sort((a, b) =>
      sort === 'author' ? by(a).localeCompare(by(b)) : sort === 'year' ? (yearOf(b) ?? 0) - (yearOf(a) ?? 0) : sort === 'title' ? titleOf(a).localeCompare(titleOf(b)) : b.addedAt.localeCompare(a.addedAt),
    );
  const present = [...new Set(sources.map((s) => s.check?.verdict).filter((v): v is Verdict => !!v))];
  const ready = sources.filter((s) => citable(s)).length;
  const current = sources.find((s) => s.id === open);

  return (
    <>
      <div className="stack">
        <h1>Library</h1>
        <p className="soft">A source can be cited when it was found, checked and approved. You can keep a flagged one, with a reason that stays on every export.</p>
      </div>
      <div className={css.bar}>
        <strong role="status">
          {sources.length === 0 ? 'No sources yet' : `${ready} of ${sources.length} ready to cite`}
        </strong>
        <button className="btn" type="button" aria-expanded={adding} onClick={() => setAdding(!adding)}>
          {adding ? 'Close' : 'Add a source'}
        </button>
      </div>
      {(adding || sources.length === 0) && <AddSource projectId={project.id} onAdded={(id) => setOpen(id)} onBusy={() => setAdding(true)} />}
      <Duplicates project={project} sources={sources} />
      {sources.length === 0 ? (
        <div className={`card ${css.empty}`}>
          <h2>Nothing here yet</h2>
          <p className="soft">
            <Link to={`/p/${project.id}/find`}>Find sources</Link> for your question, or <Link to="/check">check a list you already have</Link> and save the good ones.
          </p>
        </div>
      ) : (
        <>
          <RetractionCheck project={project} sources={sources} />
          <div className={css.filters}>
            <label className={css.wide}>
              <span>Search your library</span>
              <input className="field" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title, author, tag or note" />
            </label>
            <label>
              <span>Status</span>
              <select className="field" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                <option value="all">All</option>
                <option value="citable">Ready to cite</option>
                <option value="waiting">Waiting for you</option>
              </select>
            </label>
            <label>
              <span>Label</span>
              <select className="field" value={verdict} onChange={(e) => setVerdict(e.target.value as Verdict)}>
                <option value="all">All</option>
                {present.map((v) => (
                  <option key={v} value={v}>
                    {VERDICT_TEXT[v].label}
                  </option>
                ))}
                {sources.some((s) => !s.check) && <option value="none">Not checked</option>}
              </select>
            </label>
            {folders.length > 0 && (
              <label>
                <span>Folder</span>
                <select className="field" value={folder} onChange={(e) => setFolder(e.target.value)}>
                  <option value="all">All</option>
                  {folders.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                  <option value="none">No folder</option>
                </select>
              </label>
            )}
            {tags.length > 0 && (
              <label>
                <span>Tag</span>
                <select className="field" value={tag} onChange={(e) => setTag(e.target.value)}>
                  <option value="all">All</option>
                  {tags.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              <span>Sort by</span>
              <select className="field" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="newest">Newest</option>
                <option value="author">Author</option>
                <option value="year">Year</option>
                <option value="title">Title</option>
              </select>
            </label>
          </div>
          <div className={css.split}>
            {shown.length === 0 ? (
              <p className="soft">Nothing matches these filters.</p>
            ) : (
              <ul className={css.list}>
                {shown.map((s) => (
                  <li key={s.id}>
                    <button type="button" className={css.item} aria-pressed={open === s.id} onClick={() => setOpen(s.id)}>
                      <span className={css.title}>{titleOf(s)}</span>
                      <span className={css.sub}>
                        {by(s)} · {yearOf(s) ?? 'year not stated'}
                        {s.record?.container ? ` · ${s.record.container}` : ''}
                      </span>
                      <span className={css.marks}>
                        <SourceMark s={s} />
                        {s.record?.notices?.some((x) => x.kind === 'concern') && <span className={css.flag}>Expression of concern</span>}
                        {s.record?.notices?.some((x) => x.kind === 'correction') && <span className={css.flag}>Corrected</span>}
                        {!!s.retractedRefs?.items.length && <span className={css.flag}>Cites retracted work</span>}
                        {s.folder && <span className={css.chip}>{s.folder}</span>}
                        {s.tags.map((t) => (
                          <span key={t} className={css.chip}>
                            #{t}
                          </span>
                        ))}
                      </span>
                      <span className={css.state}>{citable(s) ? (s.keptWithReason ? 'Kept with your reason' : 'Ready to cite') : 'Waiting for you'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className={css.side}>{current ? <Detail key={current.id} s={current} folders={folders} onClose={() => setOpen(null)} /> : <p className="soft">Select a source to see its receipt, approve it, or add notes.</p>}</div>
          </div>
        </>
      )}
    </>
  );
}

function Detail({ s, folders, onClose }: { s: Source; folders: string[]; onClose: () => void }) {
  const id = useId();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [tags, setTags] = useState(s.tags.join(', '));
  const [folder, setFolder] = useState(s.folder ?? '');
  const [notes, setNotes] = useState(s.notes);
  const [title, setTitle] = useState(s.citeTitle ?? sentenceCase(titleOf(s)).text);
  const clean = isClean(s);
  const issues = sourceIssues(s);
  const cased = sentenceCase(titleOf(s));

  async function attempt(fn: () => Promise<unknown>) {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    }
    setBusy(false);
  }
  const again = () =>
    attempt(async () => {
      const r = await checkAgain(s);
      if (!r.ok) throw new Error(`A registry did not answer, so the result from ${new Date(s.check!.checkedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} stays.`);
    });

  return (
    <section className={css.detail} aria-label="Source details">
      <div className={css.detailHead}>
        <h2>{titleOf(s)}</h2>
        <button className="btn quiet" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <KeyRow s={s} />
      {s.check ? (
        <Receipt check={s.check} {...(s.raw ? { raw: s.raw } : {})}>
          <button className="btn" type="button" disabled={busy} onClick={() => void again()}>
            Check again
          </button>
        </Receipt>
      ) : (
        <div className={`card ${css.web}`}>
          <SourceMark s={s} />
          <p>{s.origin === 'web' ? 'This is a web page you added. No registry covers web pages, so nothing here was checked for you.' : 'This has not been checked yet.'}</p>
          {s.raw?.url && (
            <a href={s.raw.url} target="_blank" rel="noreferrer">
              Open the page
            </a>
          )}
          {s.origin !== 'web' && (
            <button className="btn" type="button" disabled={busy} onClick={() => void again()}>
              Check it
            </button>
          )}
        </div>
      )}
      {issues.map((x) => (
        <p key={x} className={css.warn}>
          {x}
        </p>
      ))}
      {!!s.retractedRefs?.items.length && (
        <div className={css.warn}>
          <p>
            <strong>This source cites {s.retractedRefs.items.length === 1 ? 'a work that was retracted' : `${s.retractedRefs.items.length} works that were retracted`}.</strong> That can be right, for example to criticise it. Look at how it is used.
          </p>
          <ul>
            {s.retractedRefs.items.map((r) => (
              <li key={r.id}>
                {cleanTitle(r.title)}
                {r.year ? ` (${r.year})` : ''}{' '}
                {r.doi && (
                  <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noreferrer">
                    Open it
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={css.decide}>
        {s.keys.approved ? (
          <p>
            <strong>{s.keptWithReason ? 'Kept with your reason' : 'You approved this source.'}</strong>
            {s.keptWithReason && <> “{s.keptWithReason}”</>}
          </p>
        ) : clean ? (
          <button className="btn main" type="button" disabled={busy} onClick={() => void attempt(() => approveSource(s.id))}>
            Approve
          </button>
        ) : (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void attempt(() => approveSource(s.id, reason));
            }}
          >
            <label htmlFor={`${id}-why`}>
              <strong>Why are you keeping this?</strong> <span className="soft">At least {POLICY.overrideReasonMinChars} characters. It is printed on every export.</span>
            </label>
            <textarea id={`${id}-why`} className="field" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            <button className="btn" type="submit" disabled={busy}>
              Keep with this reason
            </button>
          </form>
        )}
        {confirming ? (
          <div className="row" role="alert">
            <span>Remove this source and its notes?</span>
            <button className="btn" type="button" onClick={() => void removeSource(s.id).then(onClose)}>
              Yes, remove
            </button>
            <button className="btn quiet" type="button" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        ) : (
          <button className="btn quiet" type="button" onClick={() => setConfirming(true)}>
            Remove
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className={css.error}>
          {error}
        </p>
      )}

      <form
        className={css.notes}
        onSubmit={(e) => {
          e.preventDefault();
          void attempt(() => editSource(s.id, { folder: folder.trim(), tags: [...new Set(tags.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean))], notes }));
        }}
      >
        <label>
          <span>Folder</span>
          <input className="field" list={`${id}-folders`} value={folder} onChange={(e) => setFolder(e.target.value)} />
          <datalist id={`${id}-folders`}>
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </label>
        <label>
          <span>Tags, separated by commas</span>
          <input className="field" value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
        <label>
          <span>Notes</span>
          <textarea className="field" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button className="btn" type="submit" disabled={busy || (folder === (s.folder ?? '') && tags === s.tags.join(', ') && notes === s.notes)}>
          Save notes
        </button>
      </form>

      {(cased.check.length > 0 || s.citeTitle) && (
        <form
          className={css.notes}
          onSubmit={(e) => {
            e.preventDefault();
            void attempt(() => editSource(s.id, { citeTitle: title.trim() }));
          }}
        >
          <label>
            <span>
              Title as it will be cited. Please look at the capitals of: {cased.check.join(', ') || 'the title you corrected'}. Names keep theirs.
            </span>
            <textarea className="field" rows={2} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <button className="btn" type="submit" disabled={busy || title === s.citeTitle}>
            These capitals are right
          </button>
        </form>
      )}
      {s.text ? (
        <details>
          <summary>{s.textOrigin === 'abstract' ? 'Abstract' : 'Text we can read'}</summary>
          <p className={css.text}>{s.text.slice(0, 4000)}</p>
        </details>
      ) : (
        <p className="soft">We have no text for this source, so claims cannot be compared with it yet. Add its PDF to fix that.</p>
      )}
    </section>
  );
}

const TABS = [
  ['doi', 'DOI or title'],
  ['file', 'BibTeX or RIS'],
  ['web', 'Web page'],
  ['pdf', 'PDF'],
] as const;

function AddSource({ projectId, onAdded, onBusy }: { projectId: string; onAdded: (id: string) => void; onBusy: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('doi');
  const [line, setLine] = useState('');
  const [file, setFile] = useState('');
  const [web, setWeb] = useState<WebPage>({ url: '', title: '', author: '', year: '', site: '' });
  const [busy, setBusy] = useState('');
  const [said, setSaid] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    setSaid('');
    setError('');
  }, [tab]);

  async function addAll(kind: 'doi' | 'bibtex' | 'ris', refs: RawReference[]) {
    setError('');
    setSaid('');
    let added = 0;
    let dup = 0;
    let last = '';
    try {
      for (const [i, r] of refs.slice(0, 60).entries()) {
        setBusy(`Checking ${i + 1} of ${Math.min(refs.length, 60)}`);
        const a = await addChecked(projectId, kind, r);
        if (a.isNew) added++;
        else dup++;
        last = a.source.id;
      }
      setSaid([`${added} added.`, dup ? `${dup} already in your library.` : '', refs.length > 60 ? 'Only the first 60 were read.' : ''].filter(Boolean).join(' '));
      if (last) onAdded(last);
      setLine('');
      setFile('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    }
    setBusy('');
  }

  return (
    <section className={`card ${css.add}`} aria-label="Add a source">
      <div className={css.tabs} role="group" aria-label="How to add">
        {TABS.map(([k, n]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>
            {n}
          </button>
        ))}
      </div>
      {tab === 'doi' && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            const r = refFromLine(line);
            if (r) void addAll('doi', [r]);
            else setError('Enter a DOI, or at least three words of the title.');
          }}
        >
          <label className="stack">
            <span>DOI, DOI link or title</span>
            <input className="field" value={line} onChange={(e) => setLine(e.target.value)} placeholder="10.1126/science.adh2586" />
          </label>
          <button className="btn main" type="submit" disabled={!!busy || !line.trim()}>
            Check and add
          </button>
        </form>
      )}
      {tab === 'file' && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            const x = refsFromFile(file);
            if (x?.refs.length) void addAll(x.kind, x.refs);
            else setError('No BibTeX or RIS entries found in that text.');
          }}
        >
          <label className="stack">
            <span>Paste BibTeX or RIS, or choose a file</span>
            <textarea className="field" rows={5} value={file} spellCheck={false} onChange={(e) => setFile(e.target.value)} />
          </label>
          <div className="row">
            <input type="file" aria-label="BibTeX or RIS file" accept=".bib,.ris,.txt" onChange={(e) => void e.target.files?.[0]?.text().then(setFile)} />
            <button className="btn main" type="submit" disabled={!!busy || !file.trim()}>
              Check and add all
            </button>
          </div>
        </form>
      )}
      {tab === 'web' && (
        <form
          className={css.webform}
          onSubmit={(e) => {
            e.preventDefault();
            const bad = webProblems(web);
            if (bad.length) {
              setError(bad[0]!);
              return;
            }
            setError('');
            void addWebPage(projectId, web).then((s) => {
              setSaid('Added. It needs your reason before you can cite it.');
              onAdded(s.id);
              setWeb({ url: '', title: '', author: '', year: '', site: '' });
            });
          }}
        >
          {(
            [
              ['url', 'Address'],
              ['title', 'Page title'],
              ['author', 'Author or organisation'],
              ['year', 'Year, if the page gives one'],
              ['site', 'Website name'],
            ] as const
          ).map(([k, n]) => (
            <label key={k} className="stack">
              <span>{n}</span>
              <input className="field" value={web[k]} onChange={(e) => setWeb({ ...web, [k]: e.target.value })} />
            </label>
          ))}
          <button className="btn main" type="submit">
            Add web page
          </button>
        </form>
      )}
      {tab === 'pdf' && <PdfDrop projectId={projectId} onBusy={onBusy} onAdded={onAdded} />}
      <p role="status" className="soft">
        {busy || said}
      </p>
      {error && (
        <p role="alert" className={css.error}>
          {error}
        </p>
      )}
    </section>
  );
}
