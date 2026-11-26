import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Judged, Support } from '@/core/claims/label';
import type { Project } from '@/core/contracts';
import { askAi } from '@/core/aiClient';
import { explainInput, explanationShape, type ExplainInput } from '@/core/lab/explain';
import { agentAllowed, POLICY } from '@/policy/policy';
import css from './ExplainLabel.module.css';

interface Props {
  project: Project;
  claim: string;
  sentence: string;
  judged: Judged;
  support: Support | null;
  /** True while the support scores are still arriving: an answer now would be thrown away when they land. */
  busy?: boolean;
}

/**
 * "Explain this label in plain words (AI)" on the Evidence claim scorecard. The label comes from judge() and never
 * changes here: the AI only puts the checks into words, and the answer is shown only if it passes our checks.
 * Shown only when the project's AI level allows the Explainer (level 2).
 */
export function ExplainLabel({ project, claim, sentence, judged, support, busy = false }: Props) {
  const input = useMemo(() => explainInput(claim, sentence, judged, support), [claim, sentence, judged, support]);
  if (!agentAllowed('explainer', project.aiLevel)) return null;
  // A new claim, sentence, label or score starts again with nothing shown.
  return <Explainer key={JSON.stringify(input)} project={project} input={input} busy={busy} />;
}

type State = { kind: 'idle' } | { kind: 'loading' } | { kind: 'done'; text: string; model: string } | { kind: 'failed'; text: string };

const WHY: Record<'locked' | 'cap' | 'unavailable' | 'bad-answer', string> = {
  locked: 'AI is locked at this project’s level, so nothing was sent.',
  cap: `This project has used its ${POLICY.maxAiCallsPerProject} AI calls, so nothing was sent.`,
  unavailable: 'The AI explanation is not available right now. The label and the checks above stand.',
  'bad-answer': 'The AI answer did not pass our checks, so it is not shown. The label above stands.',
};

function Explainer({ project, input, busy }: { project: Project; input: ExplainInput; busy: boolean }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const mounted = useRef(true);
  const answer = useRef<HTMLElement>(null);
  const heading = useId();

  useEffect(() => {
    mounted.current = true;
    const changed = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', changed);
    window.addEventListener('offline', changed);
    return () => {
      mounted.current = false;
      window.removeEventListener('online', changed);
      window.removeEventListener('offline', changed);
    };
  }, []);

  useEffect(() => {
    // The button goes once there is an answer, so keyboard focus moves to the answer instead of the page.
    if (state.kind === 'done') answer.current?.focus({ preventScroll: true });
  }, [state.kind]);

  async function explain() {
    if (state.kind === 'loading' || busy) return;
    setState({ kind: 'loading' });
    const r = await askAi(project, 'explain', input, explanationShape(input));
    if (!mounted.current) return;
    setState(r.ok ? { kind: 'done', text: r.data.explanation, model: r.model } : { kind: 'failed', text: WHY[r.reason] });
  }

  return (
    <div className={css.explain}>
      {state.kind !== 'done' && (
        // Not disabled while asking, so keyboard focus stays on it; a second click is ignored.
        <button className="btn" type="button" disabled={!online || busy} aria-disabled={state.kind === 'loading' || undefined} onClick={() => void explain()}>
          {state.kind === 'loading' ? 'Asking the AI…' : 'Explain this label in plain words (AI)'}
        </button>
      )}
      {busy && online && state.kind === 'idle' && <p className={css.note}>Waiting for the support scores, so the explanation uses them.</p>}
      {!online && state.kind !== 'done' && <p className={css.note}>Your browser reports that it is offline. The AI explanation needs a connection; the label and the checks work without one.</p>}
      <div role="status" aria-live="polite" className="stack">
        {state.kind === 'loading' && <p className="soft">Asking the AI to put these checks into words…</p>}
        {state.kind === 'failed' && <p className={css.error}>{state.text}</p>}
        {state.kind === 'done' && (
          <section ref={answer} tabIndex={-1} className={`card ${css.box}`} aria-labelledby={heading}>
            <h3 id={heading}>AI explanation</h3>
            <p>{state.text}</p>
            <p className="soft">
              From {state.model}. A suggestion. It does not change the label.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
