import { useEffect, useRef, useState } from 'react';
import { continueAsGuest, currentSession } from '@/auth/accounts';
import { registries } from '@/core/registries';
import { parseReference } from '@/core/verify/parse';
import { checkReference } from '@/core/verify/verdict';
import { SAMPLE_TEXT } from '@/fixtures/sample';
import { HANDOFF } from '@/pages/Check';
import { CLAIM_HANDOFF } from '@/pages/Read';
import { addSource, approvePlan, createProject } from '@/store/actions';
import { db } from '@/store/db';
import { go } from './router';
import css from './Tour.module.css';

const SAMPLE_QUESTION = 'SAMPLE: Does remote work improve employee productivity?';
const SAMPLE_DOIS = ['10.1093/qje/qju032', '10.1126/science.adh2586', '10.1038/s41598-023-41032-5'];

/** One sample project, reused. It is there at once, and its sources are looked up live while the first steps play. */
async function sampleProject(): Promise<string> {
  const old = await db.projects.filter((p) => p.question === SAMPLE_QUESTION).first();
  const p = old ?? (await createProject(SAMPLE_QUESTION, 'apa', 1));
  if (!p.plan?.approvedAt) await approvePlan(p.id, { queries: ['remote work employee productivity'] });
  return p.id;
}
async function fillSample(projectId: string): Promise<void> {
  await Promise.all(
    SAMPLE_DOIS.map(async (doi) => {
      const check = await checkReference(parseReference(doi), registries);
      if (check.verdict === 'confirmed') await addSource(projectId, 'doi', { check, raw: { raw: doi, doi } });
    }),
  );
}

interface Step { title: string; say: string; ms: number; run: (pid: string) => void | Promise<void> }

const keep = (key: string, value: string): void => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* storage blocked: the page opens empty */
  }
};

const STEPS: Step[] = [
  {
    title: 'Check references',
    say: 'This paragraph has five references. Each one is being looked up in real library databases. No AI takes part.',
    ms: 10_000,
    run: () => {
      keep(HANDOFF, SAMPLE_TEXT);
      go('/projects');
      setTimeout(() => go('/check'), 30);
    },
  },
  { title: 'The verdicts', say: 'Two are real. One was retracted, one DOI belongs to another paper, and one is in no database we searched.', ms: 8000, run: () => document.querySelector<HTMLElement>('[role="status"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }) },
  { title: '1. Plan', say: 'A project starts with your question. Nothing is searched until you approve the searches.', ms: 7000, run: (p) => go(`/p/${p}/plan`) },
  { title: '3. Library', say: 'These papers were found and checked. They wait for you: nothing can be cited until you press Approve.', ms: 8000, run: (p) => go(`/p/${p}/library`) },
  {
    title: '4. Evidence',
    say: 'Type what you want to say. We show the exact sentence in the paper, or tell you it is not there.',
    ms: 8000,
    run: async (p) => {
      const s = (await db.sources.where('projectId').equals(p).toArray()).find((x) => x.record?.doi === SAMPLE_DOIS[0]);
      if (s) keep(CLAIM_HANDOFF, JSON.stringify({ sourceId: s.id, text: 'Home working led to a 13% performance increase.' }));
      go(`/p/${p}/evidence`);
    },
  },
  { title: '5. Write', say: 'You write it yourself. We add citations from your library and flag copied words and wrong quotations.', ms: 8000, run: (p) => go(`/p/${p}/write`) },
  { title: '6. Export', say: 'Only sources you approved come out, in APA 7 or four other styles, with an honest statement of any AI you used.', ms: 7000, run: (p) => go(`/p/${p}/export`) },
  { title: 'The agents', say: 'Nine helpers with one job each. They stop at three gates, and only you can open a gate.', ms: 7000, run: (p) => go(`/p/${p}/team`) },
];

/** A guided minute on the real site. Scrolling or clicking pauses it. It never disappears on its own. */
export function Tour() {
  const [at, setAt] = useState(-1);
  const [paused, setPaused] = useState(false);
  const [pid, setPid] = useState('');
  const [note, setNote] = useState('');
  const live = useRef(false);
  live.current = at >= 0 && !paused;

  useEffect(() => {
    const start = () => {
      // The tour is for anyone, so it uses the guest library when nobody is signed in.
      if (currentSession().kind !== 'account') continueAsGuest();
      setNote('');
      setPaused(false);
      sampleProject()
        .then((id) => {
          setPid(id);
          setAt(0);
          void fillSample(id).catch(() => undefined);
        })
        .catch(() => setNote('This browser is blocking storage, so the tour cannot make its sample project. You can still check references.'));
    };
    window.addEventListener('pt:tour', start);
    return () => window.removeEventListener('pt:tour', start);
  }, []);

  useEffect(() => {
    if (at < 0 || !pid) return;
    void Promise.resolve(STEPS[at]?.run(pid)).catch(() => undefined);
  }, [at, pid]);

  useEffect(() => {
    if (at < 0 || paused) return;
    const last = at === STEPS.length - 1;
    const timer = setTimeout(() => (last ? setPaused(true) : setAt(at + 1)), STEPS[at]!.ms);
    return () => clearTimeout(timer);
  }, [at, paused]);

  useEffect(() => {
    const hold = (e: Event) => {
      if (live.current && !(e.target instanceof Element && e.target.closest('[data-tour]'))) setPaused(true);
    };
    const names = ['pointerdown', 'wheel', 'keydown'] as const;
    names.forEach((n) => window.addEventListener(n, hold, { passive: true }));
    return () => names.forEach((n) => window.removeEventListener(n, hold));
  }, []);

  const close = () => {
    setAt(-1);
    setNote('');
  };
  if (note)
    return (
      <aside className={css.bar} data-tour role="status" aria-label="Tour">
        <p>{note}</p>
        <button className="btn" type="button" onClick={close}>
          Close
        </button>
      </aside>
    );
  const s = STEPS[at];
  if (!s) return null;
  const end = at === STEPS.length - 1;
  return (
    <aside className={css.bar} data-tour aria-label="Tour">
      <div className={css.say} role="status" aria-live="polite">
        <strong>
          {s.title} <span className="sample">SAMPLE</span>
        </strong>
        <p>{s.say}</p>
      </div>
      <div className={css.acts}>
        <span className={css.n}>
          {at + 1} of {STEPS.length}
        </span>
        <button className="btn" type="button" disabled={at === 0} onClick={() => setAt(at - 1)}>
          Previous
        </button>
        {end ? (
          <button className="btn main" type="button" onClick={() => { close(); go('/projects'); }}>
            Start my project
          </button>
        ) : (
          <>
            <button className="btn" type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button className="btn main" type="button" onClick={() => setAt(at + 1)}>
              Next
            </button>
          </>
        )}
        <button className="btn quiet" type="button" onClick={close}>
          End tour
        </button>
      </div>
      <span className={css.line} aria-hidden="true" key={`${at}${paused}`} data-run={!paused && !end} style={{ animationDuration: `${s.ms}ms` }} />
    </aside>
  );
}
