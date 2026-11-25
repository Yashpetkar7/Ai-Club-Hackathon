import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link } from '@/app/router';
import type { StepProps } from '@/app/ProjectShell';
import { REASON_TEXT } from '@/core/contracts';
import { reviewProject, type Finding } from '@/core/review/review';
import { record as log } from '@/log/log';
import { db } from '@/store/db';
import { ClaimStamp, Stamp } from '@/ui/Stamp';
import css from './Review.module.css';

const GROUPS: { level: Finding['level']; title: string; empty: string }[] = [
  { level: 'fix', title: 'Fix before you hand in', empty: 'Nothing we can see. That is not the same as nothing.' },
  { level: 'look', title: 'Look at again', empty: 'Nothing here.' },
  { level: 'ok', title: 'In order', empty: 'Nothing yet.' },
];

export function Review({ project }: StepProps) {
  const data = useLiveQuery(async () => {
    const [sources, claims, events, draft] = await Promise.all([
      db.sources.where('projectId').equals(project.id).toArray(),
      db.claims.where('projectId').equals(project.id).toArray(),
      db.log.where('projectId').equals(project.id).sortBy('seq'),
      db.drafts.get(project.id),
    ]);
    return { sources, claims, log: events, draft: draft?.html ?? '' };
  }, [project.id]);
  const review = useMemo(() => (data ? reviewProject({ projectId: project.id, style: project.style, ...(project.notTheSame ? { notTheSame: project.notTheSame } : {}), ...data }) : null), [data, project.id, project.style, project.notTheSame]);
  const [said, setSaid] = useState('');
  const fix = review?.findings.filter((f) => f.level === 'fix').length ?? 0;
  const look = review?.findings.filter((f) => f.level === 'look').length ?? 0;
  const read = !!review;

  useEffect(() => {
    if (read) void log(project.id, 'code', 'reviewer.ran', `${fix} to fix, ${look} to look at`);
    // Logged once for each visit, not on every change.
  }, [read, project.id]);

  if (!review || !data) return <p className="soft">Reading the whole project…</p>;
  return (
    <>
      <div className="stack">
        <h1>Review</h1>
        <p className="soft">What a marker could question in your project. A clean page does not mean the work is right.</p>
      </div>
      <section className={css.sum} aria-label="Summary">
        <div data-level="fix">
          <strong>{fix}</strong> to fix
        </div>
        <div data-level="look">
          <strong>{look}</strong> to look at
        </div>
        <div data-level="ok">
          <strong>{review.findings.filter((f) => f.level === 'ok').length}</strong> in order
        </div>
      </section>
      {GROUPS.map((g) => {
        const items = review.findings.filter((f) => f.level === g.level);
        return (
          <section key={g.level} className="stack">
            <h2>{g.title}</h2>
            {items.length === 0 ? (
              <p className="soft">{g.empty}</p>
            ) : (
              <ul className={css.list}>
                {items.map((f) => (
                  <li key={f.id} className="card" data-level={f.level}>
                    <div className="stack">
                      <strong>{f.title}</strong>
                      <p className="soft">{f.detail.length > 420 ? `${f.detail.slice(0, 420)}…` : f.detail}</p>
                    </div>
                    <Link to={f.to} className="btn">
                      {f.open}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <section className="stack">
        <h2>Your draft, sentence by sentence</h2>
        {review.lines.length === 0 ? (
          <p className="soft">
            {data.draft.trim() ? 'No sentence cites a source or reports a result yet.' : 'There is no draft yet.'} <Link to={`/p/${project.id}/write`}>Open Write</Link>
          </p>
        ) : (
          <ul className={css.lines}>
            {review.lines.map((l, i) => (
              <li key={i} data-label={l.label}>
                <p>{l.text}</p>
                <div className="row">
                  {l.label === 'uncited' ? (
                    <Stamp tone="warn" mark="?">
                      No citation
                    </Stamp>
                  ) : l.label === 'not-found' ? (
                    <Stamp tone="bad" mark="?">
                      Not in your library
                    </Stamp>
                  ) : (
                    <ClaimStamp label={l.label} />
                  )}
                  <span className="soft">{l.reasons.filter((r) => r !== 'NO_SOURCE').map((r) => REASON_TEXT[r]).join(' ')}</span>
                </div>
                {l.passage && (
                  <p className={css.passage}>
                    Closest sentence in the source{l.where ? `, ${l.where.charAt(0).toLowerCase()}${l.where.slice(1)}` : ''}: “{l.passage}”
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={css.gate}>
        <p>
          <strong>The last decision is yours.</strong> This records that you read the review. It is not an approval.
        </p>
        <button
          className="btn main"
          type="button"
          onClick={() => void log(project.id, 'student', 'review.read', `${fix} to fix, ${look} to look at when read`).then(() => setSaid('Recorded in your log.'))}
        >
          I have read this review
        </button>
        <span role="status">{said}</span>
      </section>
    </>
  );
}
