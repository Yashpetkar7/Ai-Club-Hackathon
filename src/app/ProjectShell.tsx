import { useLiveQuery } from 'dexie-react-hooks';
import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import type { AiLevel, CitationStyle, Project } from '@/core/contracts';
import { AI_LEVELS } from '@/policy/policy';
import { Find } from '@/pages/Find';
import { Plan } from '@/pages/Plan';
import { setAiLevel } from '@/store/actions';
import { db } from '@/store/db';
import { Legend } from '@/ui/Legend';
import css from './ProjectShell.module.css';
import { Link } from './router';

export interface StepProps {
  project: Project;
}

const load = {
  team: () => import('@/pages/Team'),
  library: () => import('@/pages/Library'),
  read: () => import('@/pages/Read'),
  review: () => import('@/pages/Review'),
  evidence: () => import('@/pages/Evidence'),
  challenge: () => import('@/pages/Challenge'),
  map: () => import('@/pages/Map'),
  ask: () => import('@/pages/Ask'),
  write: () => import('@/pages/Write'),
  export: () => import('@/pages/Export'),
};
const Team = lazy(() => load.team().then((m) => ({ default: m.Team })));
const Read = lazy(() => load.read().then((m) => ({ default: m.Read })));
const Review = lazy(() => load.review().then((m) => ({ default: m.Review })));
const Library = lazy(() => load.library().then((m) => ({ default: m.Library })));
const Evidence = lazy(() => load.evidence().then((m) => ({ default: m.Evidence })));
const Challenge = lazy(() => load.challenge().then((m) => ({ default: m.Challenge })));
const MapPage = lazy(() => load.map().then((m) => ({ default: m.MapPage })));
const Ask = lazy(() => load.ask().then((m) => ({ default: m.Ask })));
const Write = lazy(() => load.write().then((m) => ({ default: m.Write })));
const Export = lazy(() => load.export().then((m) => ({ default: m.Export })));

/** Fetches the other pages and the citation style while the student reads, so a dropped connection does not close the project. */
let warmed = '';
async function warm(style: CitationStyle): Promise<void> {
  if (warmed === style) return;
  warmed = style;
  try {
    await Promise.all(Object.values(load).map((f) => f()));
    await (await import('@/core/cite/load')).loadStyle(style);
  } catch {
    warmed = '';
  }
}

interface Step { key: string; label: string; hint: string; gate?: boolean; Page: ComponentType<StepProps> }

/** The way through, in order. */
const MAIN: Step[] = [
  { key: 'plan', label: 'Plan', hint: 'Choose the searches', gate: true, Page: Plan },
  { key: 'find', label: 'Find', hint: 'Keep or skip papers', gate: true, Page: Find },
  { key: 'library', label: 'Library', hint: 'Approve and organise', Page: Library },
  { key: 'evidence', label: 'Evidence', hint: 'Check each claim', gate: true, Page: Evidence },
  { key: 'write', label: 'Write', hint: 'Draft and cite', Page: Write },
  { key: 'export', label: 'Export', hint: 'Take your reference list', Page: Export },
];
/** Use them when you need them. `near` is the step each one belongs to. */
const HELPERS: (Step & { near: string })[] = [
  { key: 'team', label: 'Team', hint: 'Run all the agents', near: '', Page: Team },
  { key: 'read', label: 'Read', hint: 'Method, findings, limits', near: 'library', Page: Read },
  { key: 'map', label: 'Map', hint: 'How papers connect', near: 'library', Page: MapPage },
  { key: 'ask', label: 'Ask', hint: 'Question your sources', near: 'evidence', Page: Ask },
  { key: 'challenge', label: 'Challenge', hint: 'Look for the other side', near: 'evidence', Page: Challenge },
  { key: 'review', label: 'Review', hint: 'What a marker would question', near: 'write', Page: Review },
];

export function ProjectShell({ projectId, step }: { projectId: string; step: string }) {
  const project = useLiveQuery(async () => (await db.projects.get(projectId)) ?? null, [projectId]);
  const n = useLiveQuery(() => db.sources.where('projectId').equals(projectId).count(), [projectId]) ?? 0;

  const approved = useLiveQuery(() => db.sources.where('projectId').equals(projectId).filter((x) => x.keys.approved).count(), [projectId]) ?? 0;
  const decided = useLiveQuery(() => db.claims.where('projectId').equals(projectId).filter((c) => !!c.decision).count(), [projectId]) ?? 0;

  const style = project?.style;
  useEffect(() => {
    if (!style) return;
    const t = setTimeout(() => void warm(style), 1200);
    return () => clearTimeout(t);
  }, [style]);

  if (project === undefined) return <main className="wrap page" aria-busy="true"><p className="soft">Opening project…</p></main>;
  if (project === null)
    return (
      <main className="wrap page">
        <h1>This project is not here</h1>
        <p>
          It may be in another account, or still on another computer. <Link to="/projects">See your projects</Link>.
        </p>
      </main>
    );

  const helper = HELPERS.find((h) => h.key === step);
  const here: Step = helper ?? MAIN.find((m) => m.key === step) ?? MAIN[0]!;
  const { Page } = here;
  // A helper sits beside a step: back goes to that step, on goes to the one after it.
  const spot = MAIN.findIndex((m) => m.key === (helper ? helper.near : here.key));
  const before = helper ? MAIN[spot] : MAIN[spot - 1];
  const after = MAIN[spot + 1];
  // Filled means the student did it, never just that the page was opened.
  const done: Record<string, boolean> = { plan: !!project.plan?.approvedAt, find: n > 0, library: approved > 0, evidence: decided > 0 };

  return (
    <div className={css.shell}>
      <aside className={css.rail} aria-label="Your trail">
        <p className={css.q}>{project.question}</p>
        <ol className={css.steps}>
          {MAIN.map((m) => (
            <li key={m.key} data-state={m.key === here.key ? 'now' : done[m.key] ? 'done' : 'next'} data-gate={!!m.gate}>
              <Link to={`/p/${project.id}/${m.key}`} aria-current={m.key === here.key ? 'step' : undefined}>
                {m.label}
                {m.key === 'library' && n > 0 ? ` (${n})` : ''}
                <small>{m.hint}</small>
              </Link>
            </li>
          ))}
        </ol>
        <div className={css.helpers}>
          <p>Helpers</p>
          <ul>
            {HELPERS.map((h) => (
              <li key={h.key}>
                <Link to={`/p/${project.id}/${h.key}`} title={h.hint} aria-current={h.key === here.key ? 'step' : undefined}>
                  {h.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <label className={css.dial}>
          <span>AI allowed here</span>
          <select value={project.aiLevel} onChange={(e) => void setAiLevel(project.id, Number(e.target.value) as AiLevel)}>
            {AI_LEVELS.map((l) => (
              <option key={l.level} value={l.level}>
                {l.level} · {l.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" type="button" onClick={() => void import('@/core/report/report').then(async (m) => m.download('evidence-report.html', await m.projectReport(project)))}>
          Evidence report
        </button>
      </aside>
      <main className={css.main} id="main" tabIndex={-1}>
        <Suspense fallback={<p className="soft">Loading…</p>}>
          <Page project={project} />
        </Suspense>
        <Legend />
        <nav className={css.nextprev} aria-label="Steps">
          {before ? (
            <Link to={`/p/${project.id}/${before.key}`} className="btn">
              <span aria-hidden="true">←</span> {before.label}
            </Link>
          ) : (
            <Link to="/projects" className="btn">
              <span aria-hidden="true">←</span> Projects
            </Link>
          )}
          {after ? (
            <Link to={`/p/${project.id}/${after.key}`} className="btn">
              {after.label} <span aria-hidden="true">→</span>
            </Link>
          ) : (
            <Link to="/home" className="btn">
              Home <span aria-hidden="true">→</span>
            </Link>
          )}
        </nav>
      </main>
    </div>
  );
}
