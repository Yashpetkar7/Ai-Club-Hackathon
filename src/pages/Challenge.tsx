import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import type { StepProps } from '@/app/ProjectShell';
import { askAi, OppositePhrase } from '@/core/aiClient';
import { claimQuery, closestSentence, differentNumbers, evidenceRisks, oppositeQuery, OVERCLAIM, side, type Side } from '@/core/challenge/challenge';
import type { ReferenceCheck, RegistryRecord } from '@/core/contracts';
import { findInstructions } from '@/core/pdf/injection';
import { registries, searchPapers } from '@/core/registries';
import { cleanTitle } from '@/core/verify/normalise';
import { checkReference } from '@/core/verify/verdict';
import { record as log } from '@/log/log';
import { policyIssues } from '@/policy/apply';
import { agentAllowed } from '@/policy/policy';
import { addSource } from '@/store/actions';
import { db } from '@/store/db';
import { VerdictStamp } from '@/ui/Stamp';
import css from './Challenge.module.css';
import { FixFirst } from './Signposts';

interface Found {
  key: string;
  record: RegistryRecord;
  check?: ReferenceCheck;
  sentence: string;
  side: Side;
  numbers: boolean;
  score: number;
  kept: boolean;
}

const COLUMNS: { side: Side; title: string; empty: string }[] = [
  { side: 'same', title: 'Findings that point the same way', empty: 'Nothing found that points your way.' },
  { side: 'other', title: 'Findings that point the other way', empty: 'Nothing found against you. That is not proof you are right.' },
  { side: 'unclear', title: 'Related, or no clear finding', empty: 'Nothing else close to this claim.' },
];

export function Challenge({ project }: StepProps) {
  const [claim, setClaim] = useState('');
  const [found, setFound] = useState<Found[] | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  const [queries, setQueries] = useState<{ text: string; by: string }[]>([]);
  const run = useRef(0);
  const kept = useLiveQuery(() => db.sources.where('projectId').equals(project.id).toArray(), [project.id]);
  const keptDois = new Set(kept?.map((s) => s.record?.doi).filter(Boolean));

  useEffect(() => () => void run.current++, []);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const text = claim.trim();
    if (text.split(/\s+/).length < 4) return;
    const mine = ++run.current;
    setState('busy');
    setFound([]);
    const list = [
      { text: claimQuery(text), by: 'your claim' },
      { text: oppositeQuery(text), by: 'the opposite, by plain code' },
      { text: `${claimQuery(text)} no significant effect negative`, by: 'null and negative results, by plain code' },
    ];
    if (agentAllowed('challenger', project.aiLevel)) {
      const ai = await askAi(project, 'challenge', { claim: text }, OppositePhrase);
      if (ai.ok) list.push({ text: ai.data.query, by: `the opposite, suggested by AI (${ai.model})` });
    }
    if (run.current !== mine) return;
    setQueries(list);
    const out = new Map<string, Found>();
    const add = (record: RegistryRecord, textOf: string | undefined, isKept: boolean, check?: ReferenceCheck) => {
      const key = record.doi ?? cleanTitle(record.title).toLowerCase();
      if (out.has(key) || record.retracted || !textOf) return;
      const s = closestSentence(textOf, text);
      if (s && !findInstructions(s.text).length) out.set(key, { key, record, sentence: s.text, side: side(text, s.text), numbers: differentNumbers(text, s.text), score: s.score, kept: isKept, ...(check ? { check } : {}) });
    };
    for (const s of kept ?? []) if (s.record) add(s.record, s.text ?? s.record.abstract, true, s.check);
    let failed = 0;
    for (const q of list) {
      try {
        const r = await searchPapers(q.text, { perPage: 12 });
        for (const rec of r.records) add(rec, rec.abstract, false);
      } catch {
        failed++;
      }
      if (run.current !== mine) return;
    }
    const items = [...out.values()];
    setFound(items);
    if (!items.length && failed === list.length) {
      setState('failed');
      return;
    }
    let next = 0;
    const worker = async () => {
      while (next < items.length && run.current === mine) {
        const it = items[next++]!;
        if (it.check) continue;
        const rec = it.record;
        const check = await checkReference({ raw: cleanTitle(rec.title), title: cleanTitle(rec.title), authors: rec.authors.slice(0, 6).map((a) => a.family), ...(rec.year ? { year: rec.year } : {}), ...(rec.doi ? { doi: rec.doi } : {}) }, registries);
        if (run.current === mine) setFound((c) => c?.map((x) => (x.key === it.key ? { ...x, check } : x)) ?? c);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (run.current !== mine) return;
    setState('done');
    void log(project.id, 'code', 'challenger.searched', `${text.slice(0, 160)} | ${items.length} works compared, ${items.filter((i) => i.side === 'other').length} lean the other way`);
  }

  // Only papers a second registry confirmed are shown as evidence.
  const shown = (found ?? []).filter((f) => f.check?.verdict === 'confirmed');
  const hidden = (found ?? []).filter((f) => f.check && f.check.verdict !== 'confirmed').length;
  const risks = state === 'done' ? evidenceRisks(shown.map((f) => ({ side: f.side, ...(f.record.year ? { year: f.record.year } : {}), ...(f.record.container ? { container: f.record.container } : {}), ...(f.record.type ? { type: f.record.type } : {}) })), new Date().getFullYear()) : [];

  return (
    <>
      <div className="stack">
        <h1>Challenge a claim</h1>
        <p className="soft">We look for evidence against your claim as hard as for it, and show the exact sentences. It is a pointer, not a verdict.</p>
      </div>
      <form className="stack" onSubmit={(e) => void start(e)}>
        <label htmlFor="challenge-claim">
          <strong>Your claim</strong>
        </label>
        <textarea id="challenge-claim" className={`field ${css.claim}`} value={claim} onChange={(e) => setClaim(e.target.value)} placeholder="Working from home improves employee performance." />
        {OVERCLAIM.test(claim) && <p className={css.warn}>“{claim.match(OVERCLAIM)![0]}” is a strong word. One paper rarely supports it.</p>}
        <div className="row">
          <button className="btn main" type="submit" disabled={state === 'busy' || claim.trim().split(/\s+/).length < 4}>
            {state === 'busy' ? 'Looking for the other side…' : 'Challenge this'}
          </button>
          {!agentAllowed('challenger', project.aiLevel) && <span className="soft">The AI Challenger is locked at level {project.aiLevel}. Plain code does the work here.</span>}
        </div>
        <FixFirst project={project} on="challenge" />
      </form>

      {state === 'failed' && (
        <p role="alert" className={css.warn}>
          No registry answered, so nothing was compared. Try again in a minute.
        </p>
      )}
      {queries.length > 0 && state !== 'idle' && (
        <details>
          <summary>What we searched for</summary>
          <ul>
            {queries.map((q) => (
              <li key={q.text + q.by}>
                “{q.text}” <span className="soft">from {q.by}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {(state === 'done' || (state === 'busy' && shown.length > 0)) && (
        <>
          {risks.length > 0 && (
            <ul className={css.risks} aria-label="What to watch">
              {risks.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          <p className="soft" role="status">
            {shown.length} confirmed {shown.length === 1 ? 'paper' : 'papers'} with a sentence close to your claim.{hidden ? ` ${hidden} left out because a second registry did not confirm them.` : ''}
          </p>
          <div className={css.cols}>
            {COLUMNS.map((col) => {
              // Closest and most concrete first.
              const items = shown.filter((f) => f.side === col.side).sort((a, b) => b.score - a.score);
              return (
                <section key={col.side} className={css.col} data-side={col.side}>
                  <h2>
                    {col.title} ({items.length})
                  </h2>
                  {items.length === 0 && <p className="soft">{col.empty}</p>}
                  {items.map((f) => (
                    <article key={f.key} className={`card ${css.item}`}>
                      <blockquote>“{f.sentence}”</blockquote>
                      {f.numbers && <p className={css.warn}>The number here is different from yours.</p>}
                      <p className={css.who}>
                        <strong>{cleanTitle(f.record.title)}</strong>
                        <br />
                        {f.record.authors.slice(0, 2).map((a) => a.family).join(', ') || 'No authors listed'}
                        {f.record.authors.length > 2 ? ' et al.' : ''} · {f.record.year ?? 'year not stated'}
                        {f.record.doi && (
                          <>
                            {' · '}
                            <a href={`https://doi.org/${f.record.doi}`} target="_blank" rel="noreferrer">
                              Open the source
                            </a>
                          </>
                        )}
                      </p>
                      <div className="row">
                        <VerdictStamp verdict={f.check!.verdict} />
                        {f.kept || keptDois.has(f.record.doi) ? (
                          <span className="soft">In your library</span>
                        ) : (
                          <button className="btn quiet" type="button" onClick={() => void addSource(project.id, 'search', { record: f.record, check: f.check!, approve: !policyIssues(f.check!.record ?? f.record).length })}>
                            Keep
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </section>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
