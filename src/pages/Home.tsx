import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from '@/app/router';
import { useSession } from '@/auth/accounts';
import { CLAIM_TEXT, VERDICT_TEXT, type ClaimLabel, type Verdict } from '@/core/contracts';
import { citable } from '@/store/actions';
import { db } from '@/store/db';
import { ClaimStamp, VerdictStamp } from '@/ui/Stamp';
import css from './Home.module.css';

const WHO = { student: 'You', code: 'Code', ai: 'AI' } as const;
const SAY: Record<string, string> = {
  'project.created': 'started a project', 'ai.level': 'changed the AI level', 'style.set': 'changed the citation style', 'gate1.plan-approved': 'approved a search plan', 'scout.searched': 'searched the registries',
  'source.added': 'added a source', 'source.approved': 'approved a source', 'source.kept-with-reason': 'kept a flagged source with a reason', 'source.removed': 'removed a source', 'source.skipped': 'skipped a source', 'source.edited': 'edited a source', 'source.rechecked': 'checked a source again',
  'gate3.claim-accepted': 'accepted a claim', 'gate3.claim-rewritten': 'rewrote a claim', 'gate3.claim-rejected': 'rejected a claim', 'challenger.searched': 'looked for the other side', 'library.asked': 'asked the library', 'citation.inserted': 'inserted a citation', export: 'exported references', 'reviewer.ran': 'reviewed the project', 'analyst.read': 'read a paper', 'ai.plan': 'suggested searches', 'ai.read': 'pointed at passages', 'ai.challenge': 'suggested an opposite search', 'support.model-ran': 'compared a claim on this device',
};

export function Home() {
  const session = useSession();
  const data = useLiveQuery(async () => {
    const [projects, sources, claims] = await Promise.all([db.projects.orderBy('createdAt').reverse().toArray(), db.sources.toArray(), db.claims.toArray()]);
    const log = await db.log.orderBy('seq').reverse().limit(8).toArray();
    return { projects, sources, claims, log };
  }, []);
  if (!data) return <main className="wrap page" aria-busy="true"><p className="soft">Opening your library…</p></main>;
  const { projects, sources, claims, log } = data;
  const verdicts = (Object.keys(VERDICT_TEXT) as Verdict[]).map((v) => [v, sources.filter((s) => s.check?.verdict === v).length] as const).filter(([, n]) => n);
  const labels = (Object.keys(CLAIM_TEXT) as ClaimLabel[]).map((l) => [l, claims.filter((c) => c.label === l && c.decision !== 'rejected').length] as const).filter(([, n]) => n);
  const ready = sources.filter((s) => citable(s)).length;
  const waiting = sources.length - ready;
  const latest = projects[0];
  const name = session.kind === 'account' ? session.name : '';

  return (
    <main className="wrap page" id="main" tabIndex={-1}>
      <div className={css.top}>
        <div className="stack">
          <h1>{name ? `Hello, ${name}` : 'Your desk'}</h1>
          <p className="soft">{latest ? 'Pick up where you stopped, or start something new.' : 'Start with a question. Everything you keep stays on this device.'}</p>
        </div>
        <div className="row">
          <Link to="/projects" className="btn main">
            New project
          </Link>
          <Link to="/check" className="btn">
            Check references
          </Link>
        </div>
      </div>

      <dl className={css.stats}>
        {(
          [
            ['Projects', projects.length],
            ['Sources', sources.length],
            ['Ready to cite', ready],
            ['Waiting for you', waiting],
            ['Claims decided', claims.filter((c) => c.decision).length],
          ] as const
        ).map(([k, n]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{n}</dd>
          </div>
        ))}
      </dl>

      {projects.length === 0 ? (
        <section className={css.start}>
          <h2>Three ways to begin</h2>
          <div className={css.three}>
            <Link to="/projects" className="card">
              <strong>Ask a research question</strong>
              <span className="soft">Real papers, checked twice, for you to keep or skip.</span>
            </Link>
            <Link to="/check" className="card">
              <strong>Check a list you already have</strong>
              <span className="soft">Paste references, even ones an AI tool gave you.</span>
            </Link>
            <button type="button" className="card" onClick={() => window.dispatchEvent(new Event('pt:tour'))}>
              <strong>Take the tour</strong>
              <span className="soft">One minute, on the real site.</span>
            </button>
          </div>
        </section>
      ) : (
        <div className={css.cols}>
          <section className="stack" aria-label="Your projects">
            <h2>Projects</h2>
            <ul className={css.list}>
              {projects.slice(0, 5).map((p) => {
                const mine = sources.filter((s) => s.projectId === p.id);
                return (
                  <li key={p.id} className={`card ${css.project}`}>
                    <Link to={`/p/${p.id}/${p.plan?.approvedAt ? 'library' : 'plan'}`}>{p.question}</Link>
                    <span className="soft">
                      {mine.length} sources, {mine.filter((s) => citable(s)).length} ready to cite · AI level {p.aiLevel}
                    </span>
                    <div className="row">
                      <Link to={`/p/${p.id}/team`} className="btn">
                        Open the team
                      </Link>
                      <Link to={`/p/${p.id}/write`} className="btn quiet">
                        Write
                      </Link>
                      <Link to={`/p/${p.id}/export`} className="btn quiet">
                        Export
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
            {projects.length > 5 && <Link to="/projects">All {projects.length} projects</Link>}
          </section>
          <div className={css.right}>
            <section className="stack" aria-label="References by verdict">
              <h2>References</h2>
              {verdicts.length === 0 ? <p className="soft">Nothing checked yet.</p> : <Bars rows={verdicts.map(([v, n]) => [v, n, VERDICT_TEXT[v].tone, <VerdictStamp key={v} verdict={v} />])} />}
            </section>
            <section className="stack" aria-label="Claims by label">
              <h2>Claims</h2>
              {labels.length === 0 ? <p className="soft">No claims yet. Write one in Evidence.</p> : <Bars rows={labels.map(([l, n]) => [l, n, CLAIM_TEXT[l].tone, <ClaimStamp key={l} label={l} />])} />}
            </section>
            <section className="stack" aria-label="Recent activity">
              <h2>Recent activity</h2>
              <ul className={css.log}>
                {log.map((e) => (
                  <li key={e.seq}>
                    <strong>{WHO[e.actor]}</strong> {SAY[e.action] ?? e.action}
                    <small>{new Date(e.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}

/** Counts as bars, with the label and the number always written out. */
function Bars({ rows }: { rows: [string, number, string, React.ReactNode][] }) {
  const max = Math.max(...rows.map((r) => r[1]));
  return (
    <ul className={css.bars}>
      {rows.map(([k, n, tone, label]) => (
        <li key={k}>
          {label}
          <span className={css.track} aria-hidden="true">
            <span className={css.fill} data-tone={tone} style={{ width: `${Math.max(4, (n / max) * 100)}%` }} />
          </span>
          <strong>{n}</strong>
        </li>
      ))}
    </ul>
  );
}
