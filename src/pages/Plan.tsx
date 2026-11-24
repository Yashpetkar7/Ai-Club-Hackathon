import { useState } from 'react';
import { go } from '@/app/router';
import type { StepProps } from '@/app/ProjectShell';
import { approvePlan } from '@/store/actions';
import css from './Plan.module.css';

const STOP = new Set('a an the and or of in on at to for from by with without about into is are was were be been being do does did how what why when which who whom whose can could should would will may might must have has had it its this that these those there their they them we our you your i my me as than then so if not no yes also more most less least'.split(' '));

/** A first guess made by plain code, so level 0 works too. The Planner agent can improve on it at level 1 and above. */
export function suggestQueries(question: string): string[] {
  const words = question.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(Boolean);
  const key = words.filter((w) => !STOP.has(w.toLowerCase()));
  const base = key.join(' ');
  const out = [base];
  if (key.length >= 2) out.push(`${base} meta-analysis`, `${base} limitations criticism`);
  return [...new Set(out.filter(Boolean))];
}

export function Plan({ project }: StepProps) {
  const [queries, setQueries] = useState<string[]>(project.plan?.queries ?? suggestQueries(project.question));
  const [fromYear, setFromYear] = useState(String(project.plan?.fromYear ?? ''));
  const [error, setError] = useState('');

  async function approve() {
    const y = Number(fromYear);
    if (fromYear && !(y >= 1900 && y <= 2100)) {
      setError('Use a four-digit year, or leave it empty.');
      return;
    }
    try {
      await approvePlan(project.id, { queries, ...(fromYear ? { fromYear: y } : {}) });
      go(`/p/${project.id}/find`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the plan.');
    }
  }

  return (
    <>
      <div className="stack">
        <h1>Plan the search</h1>
        <p className="soft">These are the searches we will run. Change them until they say what you mean. Nothing is searched until you approve.</p>
      </div>
      <ol className={css.list}>
        {queries.map((q, i) => (
          <li key={i}>
            <label className="sr" htmlFor={`query-${i}`}>
              Search {i + 1}
            </label>
            <input id={`query-${i}`} className="field" value={q} onChange={(e) => setQueries((c) => c.map((x, k) => (k === i ? e.target.value : x)))} />
            <button className="btn quiet" type="button" onClick={() => setQueries((c) => c.filter((_, k) => k !== i))} aria-label={`Remove search ${i + 1}`}>
              Remove
            </button>
          </li>
        ))}
      </ol>
      <div className="row">
        <button className="btn" type="button" disabled={queries.length >= 5} onClick={() => setQueries((c) => [...c, ''])}>
          Add a search
        </button>
        <label className={css.year}>
          Only from year
          <input className="field" inputMode="numeric" placeholder="any" value={fromYear} onChange={(e) => setFromYear(e.target.value.trim())} />
        </label>
      </div>
      {error && (
        <p role="alert" className={css.error}>
          {error}
        </p>
      )}
      <div className={css.gate}>
        <p>
          <strong>Gate 1.</strong> One search looks for criticism on purpose, so you see both sides.
        </p>
        <button className="btn main" type="button" onClick={() => void approve()}>
          Approve plan and search
        </button>
      </div>
    </>
  );
}
