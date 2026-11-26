import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@/app/router';
import type { StepProps } from '@/app/ProjectShell';
import type { RegistryRecord } from '@/core/contracts';
import { alreadyHave } from '@/core/library/duplicates';
import { titleOf } from '@/core/cite/preflight';
import { registries, searchPapers } from '@/core/registries';
import { cleanTitle } from '@/core/verify/normalise';
import { checkReference } from '@/core/verify/verdict';
import { rankResearch, PRIORITY_PRESETS, TIER_LABEL, type PriorityMode, type ReviewTier } from '@/core/research/priority';
import { record as log } from '@/log/log';
import { policyIssues } from '@/policy/apply';
import { addSource, skipSource } from '@/store/actions';
import { db } from '@/store/db';
import { hitCache, planKeyOf, type Hit } from '@/agents/team';
import { PdfDrop } from '@/ui/PdfDrop';
import { VerdictStamp } from '@/ui/Stamp';
import { Receipt } from '@/ui/Receipt';
import css from './Find.module.css';

export function Find({ project }: StepProps) {
  const planKey = planKeyOf(project);
  const [hits, setHits] = useState<Hit[]>(hitCache.get(planKey)?.hits ?? []);
  const [notes, setNotes] = useState<string[]>(hitCache.get(planKey)?.notes ?? []);
  const [state, setState] = useState<'idle' | 'searching' | 'checking' | 'done' | 'failed' | 'paused'>(hitCache.has(planKey) ? 'done' : 'idle');
  const [show, setShow] = useState<string | null>(null);
  const [mode, setMode] = useState<PriorityMode>('balanced');
  const [filter, setFilter] = useState<ReviewTier | 'all'>('all');
  const [saving, setSaving] = useState<string[]>([]);
  const [error, setError] = useState('');
  const inFlight = useRef(new Set<string>());
  const runId = useRef(0);
  const kept = useLiveQuery(() => db.sources.where('projectId').equals(project.id).toArray(), [project.id]);
  const keptDois = new Set(kept?.map((s) => s.record?.doi).filter(Boolean));
  const ranked = useMemo(() => rankResearch(hits, project.question, mode), [hits, project.question, mode]);

  useEffect(() => {
    const cached = hitCache.get(planKey);
    if (cached) { setHits(cached.hits); setNotes(cached.notes); setState('done'); }
    else if (project.plan?.approvedAt) void search();
    return () => {
      runId.current++;
    };
  }, [planKey]);

  async function search() {
    if (!project.plan?.approvedAt) return;
    const mine = ++runId.current;
    setState('searching');
    setHits([]);
    setNotes([]);
    setError('');
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
        if (runId.current !== mine) return;
        failed++;
      }
    }
    if (runId.current !== mine) return;
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
        let check;
        try {
          check = await checkReference({ raw: cleanTitle(rec.title), title: cleanTitle(rec.title), authors: rec.authors.slice(0, 6).map((a) => a.family), ...(rec.year ? { year: rec.year } : {}), ...(rec.doi ? { doi: rec.doi } : {}) }, registries);
        } catch {
          if (runId.current === mine) setError('Some checks stopped unexpectedly. Unchecked papers remain unapproved. Search again to retry.');
          continue;
        }
        if (runId.current !== mine) return;
        h.check = check.record ? { ...check, record: { ...check.record, abstract: check.record.abstract ?? rec.abstract } as RegistryRecord } : check;
        setHits((cur) => cur.map((c) => (c.key === h.key ? { ...c, check: h.check } : c)));
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (runId.current === mine) {
      hitCache.set(planKey, { hits: list, notes: [...new Set(said)] });
      setState('done');
    }
  }

  async function keep(h: Hit) {
    if (!h.check || inFlight.current.has(h.key)) return;
    inFlight.current.add(h.key);
    setSaving([...inFlight.current]);
    try {
      await addSource(project.id, 'search', { record: h.record, check: h.check, approve: !h.check.sample && h.check.verdict === 'confirmed' && !policyIssues(h.check.record ?? h.record).length });
      setHits((cur) => cur.map((c) => (c.key === h.key ? { ...c, choice: 'kept' } : c)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The source could not be saved. Try again.');
    } finally {
      inFlight.current.delete(h.key);
      setSaving([...inFlight.current]);
    }
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
        <p className="soft">Find papers for your question, inspect the checks, then choose what to keep. Priority helps you decide what to read first.</p>
      </div>
      <div className={css.bar} role="status" aria-live="polite">
        <strong>
          {state === 'searching' && 'Searching…'}
          {state === 'checking' && `Checking ${hits.filter((h) => h.check).length} of ${hits.length}`}
          {state === 'done' && `${hits.length} works found, ${open} waiting for you`}
          {state === 'failed' && 'No registry answered'}
          {state === 'paused' && `Stopped. ${hits.filter((h) => h.check).length} of ${hits.length} checks completed.`}
        </strong>
        <button className="btn" type="button" disabled={state === 'searching' || state === 'checking'} onClick={() => { hitCache.delete(planKey); void search(); }}>
          Search again
        </button>
        {(state === 'searching' || state === 'checking') && <button className="btn" type="button" onClick={() => { runId.current++; setState('paused'); }}>Stop search</button>}
      </div>
      {state === 'paused' && <p className="soft">Completed results stay here. Requests already sent may finish, but their late answers will not change this list.</p>}
      {error && <p role="alert" className={css.note}>{error}</p>}
      <section className={`card ${css.priority}`} aria-label="Research priority">
        <div className={css.bar}>
          <label>Reading priority<select className="field" value={mode} onChange={(e) => setMode(e.target.value as PriorityMode)}>{Object.entries(PRIORITY_PRESETS).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}</select></label>
          <label>Show checks<select className="field" value={filter} onChange={(e) => setFilter(e.target.value as ReviewTier | 'all')}><option value="all">All papers ({hits.length})</option>{(Object.keys(TIER_LABEL) as ReviewTier[]).map((tier) => <option key={tier} value={tier}>{TIER_LABEL[tier]} ({ranked.filter((r) => r.priority.tier === tier).length})</option>)}</select></label>
        </div>
        <p className="soft">Priority is an ordering aid, not a credibility score. Metadata matches appear first; incomplete checks and warnings stay available in their own groups. Citation counts do not affect priority.</p>
        <details><summary>How priority works</summary><p>Topic match {PRIORITY_PRESETS[mode].weights.relevance}%, recency {PRIORITY_PRESETS[mode].weights.recency}%, available metadata {PRIORITY_PRESETS[mode].weights.coverage}%. Words in the title count more than words only in the abstract. Missing dates are excluded from the age calculation. Choose Topic first to avoid an age preference. These are transparent design choices, not validated research-quality weights.</p></details>
      </section>
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
        {ranked.filter((r) => filter === 'all' || r.priority.tier === filter).map(({ item: h, priority }, index) => {
          const isKept = h.choice === 'kept' || keptDois.has(h.record.doi);
          const abs = h.record.abstract ?? h.check?.record?.abstract;
          const twin = isKept ? undefined : alreadyHave(h.check?.record ?? h.record, kept ?? []);
          return (
            <li key={h.key} className={`card ${css.hit}`} data-choice={isKept ? 'kept' : h.choice}>
              <div className="stack">
                <div className={css.priorityLine}><span>Reading order {index + 1}</span><strong>Priority {priority.score}/100</strong><span>{TIER_LABEL[priority.tier]}</span></div>
                <h2 className={css.title}>{cleanTitle(h.record.title)}</h2>
                <p className="soft">
                  {h.record.authors.slice(0, 3).map((a) => a.family).join(', ') || 'No authors listed in the registry'}
                  {h.record.authors.length > 3 ? ' et al.' : ''} · {h.record.year ?? 'year not stated'}
                  {h.record.container ? ` · ${h.record.container}` : ''}
                  {h.record.citedBy ? ` · cited ${h.record.citedBy === 1 ? 'once' : `${h.record.citedBy} times`}` : ''}
                </p>
                <div className="row">
                  {h.check ? <VerdictStamp verdict={h.check.verdict} land /> : <span className="soft">{state === 'searching' || state === 'checking' ? 'Checking…' : 'Not checked'}</span>}
                  {h.check?.sample && <span className="sample">SAMPLE</span>}
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
                <details className={css.why}><summary>Why this priority?</summary><p>Topic match: {priority.parts.relevance}/100 · Recency: {priority.parts.recency ?? 'unknown'} · Metadata present: {priority.parts.coverage}/100.</p><p>Matching words: {priority.matched.join(', ') || 'none'}. Missing metadata: {priority.missing.join(', ') || 'none of the scored fields'}.</p><p className="soft">{priority.explanation}</p></details>
                {h.check && <details><summary>Inspect verification receipt</summary><Receipt check={h.check} /></details>}
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
                    <button className="btn main" type="button" disabled={!h.check || saving.includes(h.key)} onClick={() => void keep(h)}>
                      {saving.includes(h.key) ? 'Saving…' : 'Keep'}
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
      {hits.length > 0 && !ranked.some((r) => filter === 'all' || r.priority.tier === filter) && <p role="status">No papers in this group. Choose All papers to see the other results.</p>}
      <PdfDrop projectId={project.id} />
      {(kept?.length ?? 0) > 0 && (
        <div className={css.gate}>
          <p>
            <strong>Gate 2.</strong> {kept!.length} in your library. Flagged ones need a written reason there before you can cite them.
          </p>
          <Link to={`/p/${project.id}/library`} className="btn main">
            Go to library
          </Link>
          <Link to={`/p/${project.id}/learn`} className="btn">Start a study session</Link>
        </div>
      )}
    </>
  );
}
