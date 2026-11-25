import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { Link } from '@/app/router';
import type { StepProps } from '@/app/ProjectShell';
import type { RegistryRecord } from '@/core/contracts';
import { alreadyHave } from '@/core/library/duplicates';
import { titleOf } from '@/core/cite/preflight';
import { registries, searchPapers } from '@/core/registries';
import { cleanTitle } from '@/core/verify/normalise';
import { checkReference } from '@/core/verify/verdict';
import { record as log } from '@/log/log';
import { policyIssues } from '@/policy/apply';
import { addSource, skipSource } from '@/store/actions';
import { db } from '@/store/db';
import { hitCache, planKeyOf, type Hit } from '@/agents/team';
import { PdfDrop } from '@/ui/PdfDrop';
import { VerdictStamp } from '@/ui/Stamp';
import css from './Find.module.css';

export function Find({ project }: StepProps) {
  const planKey = planKeyOf(project);
  const [hits, setHits] = useState<Hit[]>(hitCache.get(planKey)?.hits ?? []);
  const [notes, setNotes] = useState<string[]>(hitCache.get(planKey)?.notes ?? []);
  const [state, setState] = useState<'idle' | 'searching' | 'checking' | 'done' | 'failed'>(hitCache.has(planKey) ? 'done' : 'idle');
  const [show, setShow] = useState<string | null>(null);
  const runId = useRef(0);
  const kept = useLiveQuery(() => db.sources.where('projectId').equals(project.id).toArray(), [project.id]);
  const keptDois = new Set(kept?.map((s) => s.record?.doi).filter(Boolean));

  useEffect(() => {
    if (project.plan?.approvedAt && !hitCache.has(planKey)) void search();
    return () => {
      runId.current++;
    };
  }, [planKey]);

  useEffect(() => {
    if (state === 'done') hitCache.set(planKey, { hits, notes });
  }, [state, hits, notes, planKey]);

  async function search() {
    const mine = ++runId.current;
    setState('searching');
    setHits([]);
    const found = new Map<string, Hit>();
    const said: string[] = [];
    let failed = 0;
    for (const query of project.plan!.queries) {
      try {
        const r = await searchPapers(query, { perPage: 8, ...(project.plan!.fromYear ? { fromYear: project.plan!.fromYear } : {}) });
        if (runId.current !== mine) return;
        if (r.note) said.push(r.note);
        for (const rec of r.records) {
          const key = rec.doi ?? cleanTitle(rec.title).toLowerCase();
          if (!found.has(key)) found.set(key, { key, record: rec, query });
        }
        setHits([...found.values()]);
      } catch {
        failed++;
      }
    }
    if (failed) said.push(`${failed} of ${project.plan!.queries.length} searches did not get an answer. Try again in a minute.`);
    setNotes([...new Set(said)]);
    if (!found.size) {
      setState(failed ? 'failed' : 'done');
      return;
    }
    void log(project.id, 'code', 'scout.searched', `${project.plan!.queries.length} searches, ${found.size} works found`);
    setState('checking');
    const list = [...found.values()];
    let next = 0;
    const worker = async () => {
      while (next < list.length && runId.current === mine) {
        const h = list[next++]!;
        const rec = h.record;
        const check = await checkReference({ raw: cleanTitle(rec.title), title: cleanTitle(rec.title), authors: rec.authors.slice(0, 6).map((a) => a.family), ...(rec.year ? { year: rec.year } : {}), ...(rec.doi ? { doi: rec.doi } : {}) }, registries);
        if (runId.current !== mine) return;
        setHits((cur) => cur.map((c) => (c.key === h.key ? { ...c, check: check.record ? { ...check, record: { ...check.record, abstract: check.record.abstract ?? rec.abstract } as RegistryRecord } : check } : c)));
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (runId.current === mine) setState('done');
  }

  async function keep(h: Hit) {
    if (!h.check) return;
    await addSource(project.id, 'search', { record: h.record, check: h.check, approve: h.check.verdict === 'confirmed' && !policyIssues(h.check.record ?? h.record).length });
    setHits((cur) => cur.map((c) => (c.key === h.key ? { ...c, choice: 'kept' } : c)));
  }

  if (!project.plan?.approvedAt)
    return (
      <>
        <h1>Find sources</h1>
        <p>
          Approve a plan first. <Link to={`/p/${project.id}/plan`}>Go to the plan</Link>.
        </p>
      </>
    );

  const open = hits.filter((h) => !h.choice && !keptDois.has(h.record.doi)).length;
  return (
    <>
      <div className="stack">
        <h1>Find sources</h1>
        <p className="soft">Real papers from scholarly registries, each looked up twice. Keep the ones you want.</p>
      </div>
      <div className={css.bar} role="status" aria-live="polite">
        <strong>
          {state === 'searching' && 'Searching…'}
          {state === 'checking' && `Checking ${hits.filter((h) => h.check).length} of ${hits.length}`}
          {state === 'done' && `${hits.length} works found, ${open} waiting for you`}
          {state === 'failed' && 'No registry answered'}
        </strong>
        <button className="btn" type="button" disabled={state === 'searching' || state === 'checking'} onClick={() => { hitCache.delete(planKey); void search(); }}>
          Search again
        </button>
      </div>
      {notes.map((n) => (
        <p key={n} className={css.note}>
          {n}
        </p>
      ))}
      {state === 'done' && hits.length === 0 && (
        <div className={`card ${css.empty}`}>
          <h2>Nothing found</h2>
          <p className="soft">No registry had a match for these searches. We will not make one up. Try broader words.</p>
          <Link to={`/p/${project.id}/plan`} className="btn">
            Change the plan
          </Link>
        </div>
      )}
      <ul className={css.list}>
        {hits.map((h) => {
          const isKept = h.choice === 'kept' || keptDois.has(h.record.doi);
          const abs = h.record.abstract ?? h.check?.record?.abstract;
          const twin = isKept ? undefined : alreadyHave(h.check?.record ?? h.record, kept ?? []);
          return (
            <li key={h.key} className={`card ${css.hit}`} data-choice={isKept ? 'kept' : h.choice}>
              <div className="stack">
                <h2 className={css.title}>{cleanTitle(h.record.title)}</h2>
                <p className="soft">
                  {h.record.authors.slice(0, 3).map((a) => a.family).join(', ') || 'No authors listed in the registry'}
                  {h.record.authors.length > 3 ? ' et al.' : ''} · {h.record.year ?? 'year not stated'}
                  {h.record.container ? ` · ${h.record.container}` : ''}
                  {h.record.citedBy ? ` · cited ${h.record.citedBy === 1 ? 'once' : `${h.record.citedBy} times`}` : ''}
                </p>
                <div className="row">
                  {h.check ? <VerdictStamp verdict={h.check.verdict} land /> : <span className="soft">Checking…</span>}
                  {h.record.openAccessUrl && (
                    <a href={h.record.openAccessUrl} target="_blank" rel="noreferrer">
                      Read free copy
                    </a>
                  )}
                  {abs && (
                    <button className="btn quiet" type="button" aria-expanded={show === h.key} onClick={() => setShow(show === h.key ? null : h.key)}>
                      {show === h.key ? 'Hide abstract' : 'Abstract'}
                    </button>
                  )}
                </div>
                {policyIssues(h.check?.record ?? h.record).map((x) => (
                  <p key={x} className={css.note}>
                    {x}
                  </p>
                ))}
                {twin && <p className={css.note}>You may already have this: {titleOf(twin)}{twin.record?.container ? `, ${twin.record.container}` : ''}.</p>}
                {show === h.key && abs && <p className={css.abs}>{abs}</p>}
              </div>
              <div className={css.acts}>
                {isKept ? (
                  <strong className={css.kept}>In your library</strong>
                ) : h.choice === 'skipped' ? (
                  <button className="btn quiet" type="button" onClick={() => setHits((c) => c.map((x) => (x.key === h.key ? { key: x.key, record: x.record, query: x.query, ...(x.check ? { check: x.check } : {}) } : x)))}>
                    Undo skip
                  </button>
                ) : (
                  <>
                    <button className="btn main" type="button" disabled={!h.check} onClick={() => void keep(h)}>
                      Keep
                    </button>
                    <button className="btn" type="button" onClick={() => { setHits((c) => c.map((x) => (x.key === h.key ? { ...x, choice: 'skipped' } : x))); void skipSource(project.id, h.record.title); }}>
                      Skip
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <PdfDrop projectId={project.id} />
      {(kept?.length ?? 0) > 0 && (
        <div className={css.gate}>
          <p>
            <strong>Gate 2.</strong> {kept!.length} in your library. Flagged ones need a written reason there before you can cite them.
          </p>
          <Link to={`/p/${project.id}/library`} className="btn main">
            Go to library
          </Link>
        </div>
      )}
    </>
  );
}
