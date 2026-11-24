import { useLiveQuery } from 'dexie-react-hooks';
import { lazy, Suspense, type ComponentType } from 'react';
import type { AiLevel, Project } from '@/core/contracts';
import { AI_LEVELS } from '@/policy/policy';
import { Find } from '@/pages/Find';
import { Plan } from '@/pages/Plan';
import { setAiLevel } from '@/store/actions';
import { db } from '@/store/db';
import css from './ProjectShell.module.css';
import { Link } from './router';

export interface StepProps {
  project: Project;
}

const Library = lazy(() => import('@/pages/Library').then((m) => ({ default: m.Library })));
const Evidence = lazy(() => import('@/pages/Evidence').then((m) => ({ default: m.Evidence })));
const Challenge = lazy(() => import('@/pages/Challenge').then((m) => ({ default: m.Challenge })));
const MapPage = lazy(() => import('@/pages/Map').then((m) => ({ default: m.MapPage })));
const Ask = lazy(() => import('@/pages/Ask').then((m) => ({ default: m.Ask })));
const Write = lazy(() => import('@/pages/Write').then((m) => ({ default: m.Write })));
const Export = lazy(() => import('@/pages/Export').then((m) => ({ default: m.Export })));

const STEPS: { key: string; label: string; gate?: string; Page: ComponentType<StepProps> }[] = [
  { key: 'plan', label: 'Plan', gate: 'You approve the plan', Page: Plan },
  { key: 'find', label: 'Find', gate: 'You keep or skip each source', Page: Find },
  { key: 'library', label: 'Library', Page: Library },
  { key: 'map', label: 'Map', Page: MapPage },
  { key: 'evidence', label: 'Evidence', gate: 'You accept each claim', Page: Evidence },
  { key: 'challenge', label: 'Challenge', Page: Challenge },
  { key: 'ask', label: 'Ask', Page: Ask },
  { key: 'write', label: 'Write', Page: Write },
  { key: 'export', label: 'Export', Page: Export },
];

export function ProjectShell({ projectId, step }: { projectId: string; step: string }) {
  const project = useLiveQuery(async () => (await db.projects.get(projectId)) ?? null, [projectId]);
  const n = useLiveQuery(() => db.sources.where('projectId').equals(projectId).count(), [projectId]) ?? 0;

  const approved = useLiveQuery(() => db.sources.where('projectId').equals(projectId).filter((x) => x.keys.approved).count(), [projectId]) ?? 0;
  const decided = useLiveQuery(() => db.claims.where('projectId').equals(projectId).filter((c) => !!c.decision).count(), [projectId]) ?? 0;

  if (project === undefined) return <main className="wrap page" aria-busy="true"><p className="soft">Opening project…</p></main>;
  if (project === null)
    return (
      <main className="wrap page">
        <h1>This project is not in this browser</h1>
        <p>
          Projects are stored only on the device that made them. <Link to="/projects">See your projects</Link>.
        </p>
      </main>
    );

  const now = STEPS.findIndex((s) => s.key === step);
  const { Page } = STEPS[now] ?? STEPS[0]!;
  // Filled means the student did it, never just that the page was opened.
  const done: Record<string, boolean> = { plan: !!project.plan?.approvedAt, find: n > 0, library: approved > 0, evidence: decided > 0 };

  return (
    <div className={css.shell}>
      <aside className={css.rail} aria-label="Your trail">
        <p className={css.q}>{project.question}</p>
        <ol className={css.steps}>
          {STEPS.map((s) => (
            <li key={s.key} data-state={s.key === (STEPS[now]?.key ?? 'plan') ? 'now' : done[s.key] ? 'done' : 'next'} data-gate={!!s.gate}>
              <Link to={`/p/${project.id}/${s.key}`} aria-current={s.key === step ? 'step' : undefined}>
                {s.label}
                {s.key === 'library' && n > 0 ? ` (${n})` : ''}
                {s.gate && <small>{s.gate}</small>}
              </Link>
            </li>
          ))}
        </ol>
        <label className={css.dial}>
          <span>AI allowed here</span>
          <select value={project.aiLevel} onChange={(e) => void setAiLevel(project.id, Number(e.target.value) as AiLevel)}>
            {AI_LEVELS.map((l) => (
              <option key={l.level} value={l.level}>
                {l.level} · {l.name}
              </option>
            ))}
          </select>
          <small>Your declaration. Our server holds you to it, and every change is logged.</small>
        </label>
        <button className="btn" type="button" onClick={() => void import('@/core/report/report').then(async (m) => m.download('evidence-report.html', await m.projectReport(project)))}>
          Evidence report
        </button>
      </aside>
      <main className={css.main} id="main" tabIndex={-1}>
        <Suspense fallback={<p className="soft">Loading…</p>}>
          <Page project={project} />
        </Suspense>
      </main>
    </div>
  );
}
