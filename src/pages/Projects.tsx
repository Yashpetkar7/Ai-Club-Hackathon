import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { projectPath } from '@/app/places';
import { go, Link } from '@/app/router';
import type { AiLevel } from '@/core/contracts';
import { AI_LEVELS } from '@/policy/policy';
import { createProject } from '@/store/actions';
import { db } from '@/store/db';
import css from './Projects.module.css';

export function Projects() {
  const projects = useLiveQuery(() => db.projects.orderBy('createdAt').reverse().toArray(), []);
  const counts = useLiveQuery(async () => {
    const m: Record<string, number> = {};
    await db.sources.each((s) => {
      m[s.projectId] = (m[s.projectId] ?? 0) + 1;
    });
    return m;
  }, []);
  const [q, setQ] = useState('');
  const [level, setLevel] = useState<AiLevel>(1);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 8) {
      setError('Write the question in a few words so the search has something to work with.');
      return;
    }
    const p = await createProject(q, 'apa', level);
    go(`/p/${p.id}/plan`);
  }

  return (
    <main className="wrap page" id="main" tabIndex={-1}>
      <h1>Projects</h1>
      <form className={`card ${css.start}`} onSubmit={submit} noValidate>
        <div className="stack">
          <label htmlFor="q">
            <strong>What are you researching?</strong>
          </label>
          <input id="q" className="field" value={q} onChange={(e) => { setQ(e.target.value); setError(''); }} placeholder="Does remote work improve employee productivity?" aria-invalid={!!error} aria-describedby={error ? 'q-error' : undefined} />
          {error && (
            <p id="q-error" className={css.error} role="alert">
              {error}
            </p>
          )}
        </div>
        <fieldset className={css.levels}>
          <legend>
            <strong>What does this assessment allow?</strong> <span className="soft">Check your assignment brief. You can change it later, and every change is logged.</span>
          </legend>
          {AI_LEVELS.map((l) => (
            <label key={l.level} className={css.level} data-on={level === l.level}>
              <input type="radio" name="level" value={l.level} checked={level === l.level} onChange={() => setLevel(l.level)} />
              <span className={css.num}>{l.level}</span>
              <strong>{l.name}</strong>
              <span className="soft">{l.means}</span>
            </label>
          ))}
        </fieldset>
        <div>
          <button className="btn main" type="submit">
            Start project
          </button>
        </div>
      </form>

      <section className="stack" aria-label="Your projects">
        {projects === undefined && <p className="soft">Opening your library…</p>}
        {projects?.length === 0 && <p className="soft">No projects yet.</p>}
        {projects?.map((p) => (
          <Link key={p.id} to={projectPath(p)} className={`card ${css.item}`}>
            <strong>{p.question}</strong>
            <span className="soft">
              {counts?.[p.id] ?? 0} sources · AI level {p.aiLevel} · {new Date(p.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </Link>
        ))}
      </section>
    </main>
  );
}
