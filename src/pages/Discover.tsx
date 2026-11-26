import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from '@/app/router';
import type { StepProps } from '@/app/ProjectShell';
import type { Project, ReferenceCheck, RegistryRecord, Source } from '@/core/contracts';
import { bareOpenalexId, checkFound, discover, FOUND_BY, relatedTo, TROUBLE_TEXT, troubleOf, whyItAppears, type Discovery, type Found, type FoundBy, type Trouble } from '@/core/discover';
import { titleOf } from '@/core/cite/preflight';
import { alreadyHave } from '@/core/library/duplicates';
import { cleanTitle } from '@/core/verify/normalise';
import { record as log } from '@/log/log';
import { policyIssues } from '@/policy/apply';
import { addSource } from '@/store/actions';
import { db } from '@/store/db';
import { SourceStamp, VerdictStamp } from '@/ui/Stamp';
import css from './Discover.module.css';

/** One work on either list. `foundBy` exists only on the search list; `why` says why the work is listed. */
interface Item {
  key: string;
  record: RegistryRecord;
  openAccess: boolean;
  foundBy?: FoundBy;
  why?: string;
}

type Adding = { at: 'checking' } | { at: 'added'; check: ReferenceCheck } | { at: 'failed' };
type Run<T> = { at: 'idle' } | { at: 'loading' } | { at: 'done'; data: T } | { at: 'failed'; trouble: Trouble };

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const changed = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', changed);
    window.addEventListener('offline', changed);
    return () => {
      window.removeEventListener('online', changed);
      window.removeEventListener('offline', changed);
    };
  }, []);
  return online;
}

const sameWork = (r: RegistryRecord, s: Source): boolean => {
  if (!s.record) return false;
  if (r.doi && s.record.doi) return r.doi.toLowerCase() === s.record.doi.toLowerCase();
  const a = bareOpenalexId(r.openalexId ?? r.id);
  return !!a && a === bareOpenalexId(s.record.openalexId ?? s.record.id);
};

/** The OpenAlex id a library source carries, when it has one. Sources get it when OpenAlex confirms them in the check. */
const oaIdOfSource = (s: Source): string | undefined => bareOpenalexId(s.record?.openalexId) ?? (s.record?.registry === 'openalex' ? bareOpenalexId(s.record.id) : undefined);

export function Discover({ project }: StepProps) {
  const online = useOnline();
  const sources = useLiveQuery(() => db.sources.where('projectId').equals(project.id).toArray(), [project.id]);
  const [adding, setAdding] = useState<Record<string, Adding>>({});
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Checked by plain code first, exactly as Find checks, then saved without the student's approval. */
  async function add(item: Item) {
    if (adding[item.key]?.at === 'checking') return;
    setAdding((cur) => ({ ...cur, [item.key]: { at: 'checking' } }));
    try {
      const check = await checkFound(item.record);
      await addSource(project.id, 'search', { record: item.record, check, approve: false });
      if (mounted.current) setAdding((cur) => ({ ...cur, [item.key]: { at: 'added', check } }));
    } catch {
      if (mounted.current) setAdding((cur) => ({ ...cur, [item.key]: { at: 'failed' } }));
    }
  }

  return (
    <>
      <div className="stack">
        <h1>Discover</h1>
        <p className="soft">Find papers that match what your question means, not only its words, and see the works OpenAlex lists as related to ones you have.</p>
        <p className={css.rule}>
          Nothing on this page can be cited by itself. Whatever you add is checked by plain code and waits in Library for your approval.
        </p>
      </div>
      {!online && (
        <p role="status" className={css.note}>
          You are offline. Searching needs a connection. Your library is safe on this device.
        </p>
      )}
      <MeaningSearch project={project} online={online} sources={sources} adding={adding} onAdd={add} />
      <MoreLikeThis project={project} online={online} sources={sources} adding={adding} onAdd={add} />
    </>
  );
}

interface PartProps {
  project: Project;
  online: boolean;
  sources: Source[] | undefined;
  adding: Record<string, Adding>;
  onAdd: (item: Item) => void;
}

function MeaningSearch({ project, online, sources, adding, onAdd }: PartProps) {
  const id = useId();
  const [query, setQuery] = useState(project.question);
  const [run, setRun] = useState<Run<Discovery>>({ at: 'idle' });
  const [asked, setAsked] = useState('');
  const runId = useRef(0);
  useEffect(
    () => () => {
      runId.current++;
    },
    [],
  );
  const approved = !!project.plan?.approvedAt;

  async function search(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || !online || run.at === 'loading') return;
    const mine = ++runId.current;
    setRun({ at: 'loading' });
    setAsked(q);
    try {
      const data = await discover(q, { perPage: 10, ...(project.plan?.fromYear ? { fromYear: project.plan.fromYear } : {}) });
      if (runId.current !== mine) return;
      setRun({ at: 'done', data });
      const missed = [data.words.trouble && 'search by words did not answer', data.meaning.trouble && 'search by meaning did not answer'].filter(Boolean).join(', ');
      void log(project.id, 'code', 'scout.searched', `Discover: "${q.slice(0, 160)}" | ${data.hits.length} works: ${countLine(data)}${missed ? ` | ${missed}` : ''}`);
    } catch (err) {
      if (runId.current === mine) setRun({ at: 'failed', trouble: troubleOf(err) });
    }
  }

  const data = run.at === 'done' ? run.data : null;
  const items: Item[] = (data?.hits ?? []).map((h) => ({ key: h.key, record: h.record, openAccess: h.openAccess, foundBy: h.foundBy, why: whyItAppears(h) }));
  const partial = data && (data.words.trouble || data.meaning.trouble);

  return (
    <section className={`card ${css.part}`} aria-labelledby={`${id}h`}>
      <h2 id={`${id}h`}>Search by meaning</h2>
      {!approved ? (
        <p>
          Nothing is searched until you approve a plan. <Link to={`/p/${project.id}/plan`}>Go to the plan</Link>.
        </p>
      ) : (
        <>
          <p className="soft">One search by your words and one by meaning, both in OpenAlex, merged into one list. Each result says how it was found.</p>
          <form className={css.ask} onSubmit={(e) => void search(e)}>
            <label className={css.label} htmlFor={`${id}q`}>
              Your question
            </label>
            <input id={`${id}q`} className="field" type="search" value={query} maxLength={300} onChange={(e) => setQuery(e.target.value)} />
            <div className="row">
              <button className="btn main" type="submit" disabled={!online || !query.trim() || run.at === 'loading'}>
                {run.at === 'loading' ? 'Searching…' : 'Search'}
              </button>
              {project.plan?.fromYear ? <span className="soft">From {project.plan.fromYear}, as your plan says.</span> : null}
            </div>
          </form>
          <p role="status" aria-live="polite" className={css.status}>
            {run.at === 'idle' && 'Nothing is searched until you press Search.'}
            {run.at === 'loading' && 'Searching by words and by meaning…'}
            {data && (data.hits.length ? `${data.hits.length} works for “${asked.slice(0, 80)}”: ${countLine(data)}.` : 'Nothing found.')}
          </p>
          {run.at === 'failed' && (
            <p role="alert" className={css.error}>
              {run.trouble === 'limit' ? `${TROUBLE_TEXT.limit} Try again later.` : run.trouble === 'offline' ? TROUBLE_TEXT.offline : 'Neither search answered. Nothing was found, and nothing was made up. Try again in a minute.'}
            </p>
          )}
          {partial && (
            <p className={css.note}>
              {data.meaning.trouble ? `The search by meaning did not answer: ${TROUBLE_TEXT[data.meaning.trouble]} These were found by words only.` : `The search by words did not answer: ${TROUBLE_TEXT[data.words.trouble!]} These were found by meaning only.`}
            </p>
          )}
          {data?.words.note && <p className={css.note}>{data.words.note}</p>}
          {data && data.hits.length === 0 && (
            <div className={css.empty}>
              <p>{partial ? 'The search that answered found no work for this question.' : 'Neither search found a work for this question.'} We will not make one up. Try other words, or a shorter question.</p>
            </div>
          )}
          <Results project={project} items={items} sources={sources} adding={adding} onAdd={onAdd} />
        </>
      )}
    </section>
  );
}

const countLine = (d: Discovery): string => {
  const n = (by: FoundBy) => d.hits.filter((h) => h.foundBy === by).length;
  return `${n('words')} found by words, ${n('meaning')} by meaning, ${n('both')} by both`;
};

function MoreLikeThis({ project, online, sources, adding, onAdd }: PartProps) {
  const id = useId();
  const withId = (sources ?? []).filter((s) => oaIdOfSource(s));
  const [pick, setPick] = useState('');
  const [run, setRun] = useState<Run<{ from: Source; found: Found[] }>>({ at: 'idle' });
  const runId = useRef(0);
  useEffect(
    () => () => {
      runId.current++;
    },
    [],
  );
  const chosen = withId.find((s) => s.id === pick) ?? withId[0];

  async function show(e: FormEvent) {
    e.preventDefault();
    if (!chosen || !online || run.at === 'loading') return;
    const oa = oaIdOfSource(chosen)!;
    const mine = ++runId.current;
    setRun({ at: 'loading' });
    try {
      const found = await relatedTo(oa);
      if (runId.current !== mine) return;
      setRun({ at: 'done', data: { from: chosen, found } });
      void log(project.id, 'code', 'scout.searched', `Discover, more like this: ${cleanTitle(titleOf(chosen)).slice(0, 120)} | ${found.length} related works in OpenAlex`);
    } catch (err) {
      if (runId.current === mine) setRun({ at: 'failed', trouble: troubleOf(err) });
    }
  }

  const data = run.at === 'done' ? run.data : null;
  const items: Item[] = (data?.found ?? []).map((f) => ({ key: `rel:${f.record.doi ?? f.record.id}`, record: f.record, openAccess: f.openAccess, why: `OpenAlex lists it as related to “${cleanTitle(titleOf(data!.from))}”.` }));

  return (
    <section className={`card ${css.part}`} aria-labelledby={`${id}h`}>
      <h2 id={`${id}h`}>More like this</h2>
      <p className="soft">OpenAlex keeps a list of related works for the papers it holds. Pick one of your sources to see its list.</p>
      {sources === undefined ? (
        <p className="soft" aria-busy="true">
          Opening your library…
        </p>
      ) : withId.length === 0 ? (
        <div className={css.empty}>
          <p>{sources.length ? 'None of your sources has an OpenAlex id yet. A source gets one when OpenAlex confirms it during the check.' : 'Your library is empty.'}</p>
          <Link to={`/p/${project.id}/${project.plan?.approvedAt ? 'find' : 'plan'}`} className="btn">
            {project.plan?.approvedAt ? 'Find sources' : 'Plan your searches'}
          </Link>
        </div>
      ) : (
        <form className={css.ask} onSubmit={(e) => void show(e)}>
          <label className={css.label} htmlFor={`${id}s`}>
            Your source
          </label>
          <select id={`${id}s`} className="field" value={chosen?.id ?? ''} onChange={(e) => setPick(e.target.value)}>
            {withId.map((s) => (
              <option key={s.id} value={s.id}>
                {`${cleanTitle(titleOf(s)).slice(0, 110)}${s.record?.year ? ` (${s.record.year})` : ''}`}
              </option>
            ))}
          </select>
          <div className="row">
            <button className="btn main" type="submit" disabled={!online || run.at === 'loading'}>
              {run.at === 'loading' ? 'Looking…' : 'Show related works'}
            </button>
          </div>
        </form>
      )}
      {withId.length > 0 && (
        <p role="status" aria-live="polite" className={css.status}>
          {run.at === 'idle' && 'Nothing is looked up until you press Show related works.'}
          {run.at === 'loading' && 'Asking OpenAlex…'}
          {data && (data.found.length ? `${data.found.length} works OpenAlex lists as related.` : 'OpenAlex lists no related works for this source.')}
        </p>
      )}
      {run.at === 'failed' && (
        <p role="alert" className={css.error}>
          {run.trouble === 'limit' ? `${TROUBLE_TEXT.limit} Try again later.` : run.trouble === 'offline' ? TROUBLE_TEXT.offline : 'OpenAlex did not answer. Nothing was found, and nothing was made up. Try again in a minute.'}
        </p>
      )}
      <Results project={project} items={items} sources={sources} adding={adding} onAdd={onAdd} />
    </section>
  );
}

function Results({ project, items, sources, adding, onAdd }: { project: Project; items: Item[]; sources: Source[] | undefined; adding: Record<string, Adding>; onAdd: (item: Item) => void }) {
  if (!items.length) return null;
  return (
    <ul className={css.list}>
      {items.map((item) => (
        <Result key={item.key} project={project} item={item} sources={sources ?? []} adding={adding[item.key]} onAdd={onAdd} />
      ))}
    </ul>
  );
}

function Result({ project, item, sources, adding, onAdd }: { project: Project; item: Item; sources: Source[]; adding: Adding | undefined; onAdd: (item: Item) => void }) {
  const r = item.record;
  const mine = sources.find((s) => sameWork(r, s));
  const twin = mine ? undefined : alreadyHave(r, sources);
  return (
    <li className={css.hit} data-kept={mine ? 'yes' : undefined}>
      <div className="stack">
        <h3 className={css.title}>{cleanTitle(r.title)}</h3>
        <p className="soft">
          {r.authors.slice(0, 3).map((a) => a.family).join(', ') || 'No authors listed in the registry'}
          {r.authors.length > 3 ? ' et al.' : ''} · {r.year ?? 'year not stated'}
          {r.container ? ` · ${r.container}` : ''}
        </p>
        <div className={css.tags}>
          {item.foundBy && <span className={css.tag}>{FOUND_BY[item.foundBy]}</span>}
          {item.openAccess ? <span className={css.tag}>Open access</span> : <span className={css.tag}>No open-access copy listed</span>}
          {!r.doi && <span className={css.tag}>No DOI listed</span>}
          {r.openAccessUrl && (
            <a href={r.openAccessUrl} target="_blank" rel="noreferrer">
              Read free copy
            </a>
          )}
        </div>
        {r.retracted && <p className={`${css.flag} t-bad`}>OpenAlex marks this work as retracted.</p>}
        {policyIssues(r).map((x) => (
          <p key={x} className={css.note}>
            {x}
          </p>
        ))}
        {twin && <p className={css.note}>You may already have this: {titleOf(twin)}.</p>}
        {item.why && (
          <details className={css.why}>
            <summary>Why it appears</summary>
            <p>{item.why}</p>
          </details>
        )}
      </div>
      <div className={css.acts}>
        {mine ? (
          <>
            <SourceStamp s={mine} />
            <span>{mine.keys.approved ? 'Approved in your library' : 'In your library, waiting for your approval'}</span>
            {!mine.keys.approved && (
              <Link to={`/p/${project.id}/library`} className="btn">
                Approve in Library
              </Link>
            )}
          </>
        ) : adding?.at === 'checking' ? (
          <span role="status">Checking…</span>
        ) : adding?.at === 'added' ? (
          <>
            <VerdictStamp verdict={adding.check.verdict} />
            <span>Added to your library, waiting for your approval</span>
            <Link to={`/p/${project.id}/library`} className="btn">
              Approve in Library
            </Link>
          </>
        ) : (
          <button className="btn main" type="button" onClick={() => onAdd(item)}>
            Add to library
          </button>
        )}
        {adding?.at === 'failed' && (
          <p role="alert" className={css.error}>
            The check or the save stopped, so nothing was added. Try again.
          </p>
        )}
      </div>
    </li>
  );
}
