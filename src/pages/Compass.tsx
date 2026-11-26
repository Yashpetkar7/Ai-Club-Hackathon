import { useLiveQuery } from 'dexie-react-hooks';
import type { StepProps } from '@/app/ProjectShell';
import { Link } from '@/app/router';
import { preflight } from '@/core/cite/preflight';
import { STUDY_STAGES, studyFingerprint, studyProgress } from '@/core/learning/study';
import { db } from '@/store/db';
import css from './Compass.module.css';

export function Compass({ project }: StepProps) {
  const data = useLiveQuery(async () => {
    const [sources, claims, events] = await Promise.all([db.sources.where('projectId').equals(project.id).toArray(), db.claims.where('projectId').equals(project.id).toArray(), db.log.where('projectId').equals(project.id).sortBy('seq')]);
    const studied = (await Promise.all(sources.filter((s) => s.text?.trim()).map(async (s) => {
      const progress = studyProgress(events, s, await studyFingerprint(s));
      return STUDY_STAGES.every((stage) => !!progress[stage.key]);
    }))).filter(Boolean).length;
    return { sources, claims, events, studied };
  }, [project.id]);
  if (!data) return <p className="soft" aria-busy="true">Finding your next step…</p>;
  const { sources, claims, events, studied } = data;
  const flight = preflight(sources);
  const readable = sources.filter((s) => s.text?.trim()).length;
  const decided = claims.filter((c) => c.decision && c.decision !== 'rejected').length;
  const next = !project.plan?.approvedAt ? 'plan' : !sources.length ? 'find' : flight.blocked.length ? 'library' : !readable ? 'read' : !studied ? 'learn' : !decided ? 'evidence' : 'write';
  const steps = [
    { key: 'plan', title: 'Shape your question', text: 'Choose and approve searches. The team starts with your plan.', done: !!project.plan?.approvedAt },
    { key: 'find', title: 'Find what matters', text: 'Rank real registry results and inspect their verification receipts.', done: sources.length > 0 },
    { key: 'library', title: 'Make a source decision', text: 'Approve matched sources. Keep warnings visible and explain exceptions.', done: sources.length > 0 && !flight.blocked.length },
    { key: 'learn', title: 'Read, question, remember', text: 'Work through exact passages, your reflections and a recall session.', done: studied > 0 },
    { key: 'evidence', title: 'Trace the claim', text: 'Check the passage, numbers and scope. Accept, rewrite or reject.', done: decided > 0 },
    { key: 'export', title: 'Leave a paper trail', text: 'Take references, exception reasons, disclosure and the evidence log.', done: events.some((e) => e.action === 'export') },
  ];
  return <>
    <header className={css.hero}><div className="stack"><h1>Your research compass</h1><p>{project.question}</p><p className="soft">A clear next step, with evidence you can inspect at every turn.</p></div><Link className="btn main" to={`/p/${project.id}/${next}`}>Continue research</Link></header>
    <div className={css.metrics} aria-label="Current project facts"><div className="card"><strong>{sources.length}</strong><span>Sources kept</span></div><div className="card"><strong>{flight.ready.length}</strong><span>Pass citation checks</span></div><div className="card"><strong>{flight.blocked.length + flight.withReason.length}</strong><span>Blocked or exceptions</span></div><div className="card"><strong>{readable}</strong><span>Have readable text</span></div></div>
    <section className={`card ${css.automation}`}><div className="stack"><h2>Let the team do the legwork</h2><p>Run search, checking and reading helpers in sequence. Automation stops for your plan, source and claim decisions. AI availability never decides whether a reference passes.</p></div><Link className="btn" to={`/p/${project.id}/team`}>Open research team</Link></section>
    <section className="stack" aria-label="Research pathway"><h2>A trail from question to evidence</h2><div className={css.path}>{steps.map((step) => <Link key={step.key} className={`card ${css.step}`} to={`/p/${project.id}/${step.key}`}><span className={css.state}>{step.done ? 'Action recorded' : step.key === next ? 'Suggested next' : 'Explore'}</span><h3>{step.title}</h3><p>{step.text}</p></Link>)}</div></section>
    <section className={`card ${css.automation}`}><div className="stack"><h2>What makes this trail inspectable</h2><p>Open the source receipt, check an exact passage, try the opposing evidence, and verify the log. A priority score is not a truth score. A study milestone is not proof of understanding.</p><p className="soft">{flight.withReason.length} sources have written exceptions. {flight.blocked.length} cannot currently be exported. The Integrity Lab exposes misses and unresolved checks.</p></div><div className="row"><Link className="btn" to="/lab">Test the checker</Link><Link className="btn" to={`/p/${project.id}/export`}>Review export gates</Link></div></section>
  </>;
}
