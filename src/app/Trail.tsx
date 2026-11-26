import { useEffect, useId, useRef } from 'react';
import css from './Trail.module.css';
import { Link } from './router';

export interface Place { key: string; label: string; hint: string; gate?: boolean }
export interface HelperPlace extends Place { near: string }

interface TrailProps {
  projectId: string;
  /** The steps, in order. */
  main: Place[];
  /** Helpers. `near` is the step each belongs to; an empty `near` means it covers the whole project. */
  helpers: HelperPlace[];
  /** The key of the page that is open. */
  here: string;
  done: Record<string, boolean>;
  /** Sources in the library, shown next to Library. */
  count: number;
}

/** One helper: its name is the link, and what it is for stays visible under it. */
function Helper({ projectId, h, here, hintId }: { projectId: string; h: HelperPlace; here: string; hintId: string }) {
  const on = h.key === here;
  return (
    <li className={css.item} data-here={on || undefined}>
      <Link to={`/p/${projectId}/${h.key}`} aria-current={on ? 'page' : undefined} aria-describedby={hintId}>
        {h.label}
      </Link>
      <small id={hintId}>{h.hint}</small>
    </li>
  );
}

/** The trail in the project rail: the whole-project pages, then each step with its helpers under it. */
export function Trail({ projectId, main, helpers, here, done, count }: TrailProps) {
  const id = useId();
  const steps = useRef<HTMLOListElement>(null);
  const whole = helpers.filter((h) => !h.near);
  const group = main.find((m) => m.key === here || helpers.some((h) => h.near === m.key && h.key === here));
  const near = group ? helpers.filter((h) => h.near === group.key) : [];

  // On a phone the steps scroll sideways. Keep the open one in view.
  useEffect(() => {
    const ol = steps.current;
    const li = ol?.querySelector<HTMLElement>('[data-state="now"], [data-open]');
    if (ol && li && ol.scrollWidth > ol.clientWidth) ol.scrollLeft = Math.max(0, li.offsetLeft - 8);
  }, [here]);

  return (
    <>
      {whole.length > 0 && (
        <ul className={css.whole} aria-label="Whole project">
          {whole.map((h) => (
            <Helper key={h.key} projectId={projectId} h={h} here={here} hintId={`${id}w-${h.key}`} />
          ))}
        </ul>
      )}
      <ol className={css.steps} ref={steps}>
        {main.map((m) => {
          const kids = helpers.filter((h) => h.near === m.key);
          const open = kids.some((k) => k.key === here);
          return (
            <li key={m.key} data-state={m.key === here ? 'now' : done[m.key] ? 'done' : 'next'} data-gate={!!m.gate} data-open={open || undefined}>
              <Link to={`/p/${projectId}/${m.key}`} className={css.step} aria-current={m.key === here ? 'step' : undefined}>
                {m.label}
                {m.key === 'library' && count > 0 ? ` (${count})` : ''}
                <small>{m.hint}</small>
              </Link>
              {kids.length > 0 && (
                <ul className={css.kids} aria-label={`Helpers for ${m.label}`}>
                  {kids.map((h) => (
                    <Helper key={h.key} projectId={projectId} h={h} here={here} hintId={`${id}k-${h.key}`} />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      {group && near.length > 0 && (
        // A phone shows the steps in one row, so the helpers of the open step come under it.
        <div className={css.phone}>
          <p id={`${id}ph`}>Helpers for {group.label}</p>
          <ul aria-labelledby={`${id}ph`}>
            {near.map((h) => (
              <Helper key={h.key} projectId={projectId} h={h} here={here} hintId={`${id}p-${h.key}`} />
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/**
 * Where you are, and the next step in order, at the top of the page. It never guesses what you should do:
 * that is Compass's job, so it is left out on Compass and on Team, which cover the whole project.
 */
export function HereNext({ projectId, main, helpers, here, done }: Omit<TrailProps, 'count'>) {
  const helper = helpers.find((h) => h.key === here);
  if (helper && !helper.near) return null;
  const at = main.findIndex((m) => m.key === (helper ? helper.near : here));
  const step = main[at];
  if (!step) return null;
  const gates = main.filter((m) => m.gate);
  const gate = step.gate && !helper ? gates.indexOf(step) + 1 : 0;
  const next = main[at + 1];
  return (
    <nav className={css.here} aria-label="Where you are">
      {helper ? (
        <p>
          <strong>{helper.label}</strong> is a helper for step {at + 1}, {step.label}. {helper.hint}.
        </p>
      ) : (
        <p>
          <strong>
            Step {at + 1} of {main.length}
          </strong>{' '}
          {step.hint}.{gate ? (done[step.key] ? ` Gate ${gate} is open.` : ` You open gate ${gate} here.`) : ''}
        </p>
      )}
      {helper ? (
        <Link to={`/p/${projectId}/${step.key}`}>Back to step {at + 1}, {step.label}</Link>
      ) : next ? (
        <Link to={`/p/${projectId}/${next.key}`}>
          Next: step {at + 2}, {next.label} <span aria-hidden="true">→</span>
        </Link>
      ) : (
        <span>This is the last step.</span>
      )}
    </nav>
  );
}
