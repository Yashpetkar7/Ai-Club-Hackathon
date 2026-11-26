import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link } from '@/app/router';
import type { StepProps } from '@/app/ProjectShell';
import { lastActions, planKeyOf, hitCache, runTeam, stopTeam, useTeam, type AgentState } from '@/agents/team';
import { agentAllowed, AGENTS, AI_LEVELS, type AgentId } from '@/policy/policy';
import { approvePlan, recordAiDecision } from '@/store/actions';
import { db } from '@/store/db';
import css from './Team.module.css';

const PAGE: Record<AgentId, string> = { planner: 'plan', scout: 'find', checker: 'library', analyst: 'read', reader: 'ask', explainer: 'evidence', challenger: 'challenge', 'quote-guard': 'evidence', reviewer: 'review', clerk: 'export' };
/** The order the work goes round, with the three places it stops for the student. */
const ORDER: (AgentId | 'gate1' | 'gate2' | 'gate3')[] = ['planner', 'gate1', 'scout', 'checker', 'gate2', 'analyst', 'reader', 'challenger', 'quote-guard', 'gate3', 'reviewer', 'clerk'];
const GATES = { gate1: 'You approve the searches', gate2: 'You keep or skip each paper', gate3: 'You accept each claim' } as const;
const STATE: Record<AgentState, string> = { idle: 'Ready', working: 'Working', waiting: 'Waiting for you', done: 'Done', locked: 'Locked', failed: 'Stopped' };

export function Team({ project }: StepProps) {
  const run = useTeam(project.id);
  const events = useLiveQuery(() => db.log.where('projectId').equals(project.id).sortBy('seq'), [project.id]) ?? [];
  const approved = useLiveQuery(() => db.sources.where('projectId').equals(project.id).filter((s) => s.keys.approved).count(), [project.id]) ?? 0;
  const claims = useLiveQuery(() => db.claims.where('projectId').equals(project.id).filter((c) => !!c.decision).count(), [project.id]) ?? 0;
  const last = useMemo(() => lastActions(events), [events]);
  const [off, setOff] = useState<string[]>([]);
  const passed = { gate1: !!project.plan?.approvedAt, gate2: approved > 0, gate3: claims > 0 };
  const waiting = hitCache.get(planKeyOf(project))?.hits.length ?? 0;
  const gate1 = run.queries && !project.plan?.approvedAt ? run.queries : null;

  async function approve() {
    const keep = gate1!.filter((q) => !off.includes(q.text));
    await approvePlan(project.id, { queries: keep.map((q) => q.text) });
    const ai = gate1!.filter((q) => q.by.startsWith('AI'));
    if (ai.length) await recordAiDecision(project.id, 'plan', { kept: ai.filter((q) => keep.includes(q)).map((q) => q.text), changed: [], rejected: ai.filter((q) => !keep.includes(q)).map((q) => q.text) });
    void runTeam(project.id);
  }

  return (
    <>
      <div className="stack">
        <h1>The team</h1>
        <p className="soft">Nine agents with one job each. They stop at three gates, and only you can open one.</p>
      </div>
      <div className={css.control}>
        <div className="stack">
          <strong role="status" aria-live="polite">
            {run.running ? `${AGENTS.find((a) => run.agents[a.id]?.state === 'working')?.name ?? 'The team'} is working…` : run.gate ? run.gate.text : events.some((e) => e.action === 'reviewer.ran') ? 'The team has been round once. Run it again after you change something.' : 'Nobody has started yet.'}
          </strong>
          <span className="soft">
            AI level {project.aiLevel}: {AI_LEVELS[project.aiLevel]!.means}
          </span>
        </div>
        {run.running ? (
          <button className="btn" type="button" disabled={run.stopping} onClick={() => stopTeam(project.id)}>
            {run.stopping ? 'Stopping…' : 'Stop'}
          </button>
        ) : (
          <button className="btn main" type="button" onClick={() => void runTeam(project.id)}>
            {run.gate || project.plan?.approvedAt ? 'Continue' : 'Start the team'}
          </button>
        )}
      </div>

      {gate1 && !run.running && (
        <section className={css.gateBox} aria-label="Gate 1">
          <h2>Gate 1. Approve the searches</h2>
          {gate1.map((q) => (
            <label key={q.text}>
              <input type="checkbox" checked={!off.includes(q.text)} onChange={(e) => setOff((c) => (e.target.checked ? c.filter((x) => x !== q.text) : [...c, q.text]))} />{' '}
              <span>
                {q.text} <small>from {q.by}</small>
              </span>
            </label>
          ))}
          <div className="row">
            <button className="btn main" type="button" disabled={gate1.every((q) => off.includes(q.text))} onClick={() => void approve()}>
              Approve and go on
            </button>
            <Link to={`/p/${project.id}/plan`} className="btn">
              Change them in Plan
            </Link>
          </div>
        </section>
      )}
      {run.gate?.n === 2 && approved === 0 && !run.running && (
        <section className={css.gateBox} aria-label="Gate 2">
          <h2>Gate 2. Keep or skip</h2>
          <p>{waiting ? `${waiting} papers are waiting for you.` : 'Sources in your library are waiting for you.'} The team goes on with what you keep.</p>
          <div className="row">
            <Link to={`/p/${project.id}/${waiting ? 'find' : 'library'}`} className="btn main">
              {waiting ? 'Choose papers' : 'Decide in the library'}
            </Link>
          </div>
        </section>
      )}
      {run.gate?.n === 3 && claims === 0 && !run.running && (
        <section className={css.gateBox} aria-label="Gate 3">
          <h2>Gate 3. Your claims</h2>
          <p>Write what you want to say. The Quote guard compares it with the exact sentence, and you accept, rewrite or reject it.</p>
          <div className="row">
            <Link to={`/p/${project.id}/evidence`} className="btn main">
              Write a claim
            </Link>
          </div>
        </section>
      )}

      <ol className={css.board} aria-label="Agents in order">
        {ORDER.map((k) => {
          if (k === 'gate1' || k === 'gate2' || k === 'gate3')
            return (
              <li key={k} className={css.gate} data-open={passed[k]}>
                <strong>{passed[k] ? 'Opened by you' : 'Closed'}</strong>
                <span>{GATES[k]}</span>
              </li>
            );
          const a = AGENTS.find((x) => x.id === k)!;
          const locked = !agentAllowed(a.id, project.aiLevel);
          const now = run.agents[a.id];
          const state: AgentState = locked ? 'locked' : (now?.state ?? (last[a.id] ? 'done' : 'idle'));
          const was = last[a.id];
          return (
            <li key={k} className={`card ${css.agent}`} data-state={state}>
              <div className={css.head}>
                <h2>{a.name}</h2>
                <span className={css.state}>{STATE[state]}</span>
              </div>
              <p className={css.kind}>{a.kind === 'code' ? 'Plain code' : `AI, level ${a.minLevel} and up`}</p>
              <p>{a.does}</p>
              <p className="soft">Cannot: {a.cannot.charAt(0).toLowerCase() + a.cannot.slice(1)}</p>
              <p className={css.note}>{locked ? `Locked at AI level ${project.aiLevel}.` : (now?.note ?? (was ? `${was.detail.slice(0, 120)}` : 'Has not worked on this project yet.'))}</p>
              <Link to={`/p/${project.id}/${PAGE[a.id]}`}>Open {PAGE[a.id] === 'ask' ? 'Ask' : PAGE[a.id]!.charAt(0).toUpperCase() + PAGE[a.id]!.slice(1)}</Link>
            </li>
          );
        })}
      </ol>

      {run.lines.length > 0 && (
        <section className="stack">
          <h2>What just happened</h2>
          <div className={css.lines} role="region" aria-label="Team activity" tabIndex={0}>
          <ol>
            {[...run.lines].reverse().map((l, i) => (
              <li key={`${l.at}-${i}`}>
                <time>{new Date(l.at).toLocaleTimeString()}</time>
                <strong>{AGENTS.find((a) => a.id === l.agent)?.name}</strong>
                <span>{l.text}</span>
              </li>
            ))}
          </ol>
          </div>
          <button className="btn" type="button" style={{ justifySelf: 'start' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            Back to the top
          </button>
        </section>
      )}
    </>
  );
}
