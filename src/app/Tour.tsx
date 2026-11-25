import { useEffect, useState } from 'react';
import { continueAsGuest, currentSession } from '@/auth/accounts';
import { registries } from '@/core/registries';
import { parseReference } from '@/core/verify/parse';
import { checkReference } from '@/core/verify/verdict';
import { SAMPLE_TEXT } from '@/fixtures/sample';
import { HANDOFF } from '@/pages/Check';
import { addSource, approvePlan, createProject } from '@/store/actions';
import { db } from '@/store/db';
import { go } from './router';
import css from './Tour.module.css';

const SAMPLE_QUESTION = 'SAMPLE: Does remote work improve employee productivity?';
const SAMPLE_DOIS = ['10.1093/qje/qju032', '10.1126/science.adh2586', '10.1038/s41598-023-41032-5'];

/** One sample project, reused. Its sources are looked up live, so nothing in it is canned. */
async function sampleProject(): Promise<string> {
  const old = await db.projects.filter((p) => p.question === SAMPLE_QUESTION).first();
  const p = old ?? (await createProject(SAMPLE_QUESTION, 'apa', 1));
  if (!p.plan?.approvedAt) await approvePlan(p.id, { queries: ['remote work employee productivity'] });
  await Promise.all(
    SAMPLE_DOIS.map(async (doi) => {
      const check = await checkReference(parseReference(doi), registries);
      if (check.verdict === 'confirmed') await addSource(p.id, 'doi', { check, raw: { raw: doi, doi }, approve: true });
    }),
  );
  return p.id;
}

interface Step {
  say: string;
  ms: number;
  run: (ctx: { pid: string }) => void | Promise<void>;
}

const STEPS: Step[] = [
  { say: 'A polished paragraph with five references. Each one is being looked up in live registries. No AI takes part.', ms: 11000, run: () => { sessionStorage.setItem(HANDOFF, SAMPLE_TEXT); go('/projects'); setTimeout(() => go('/check'), 30); } },
  { say: 'Two are real. One is retracted, one DOI belongs to another paper, and one is in no registry we searched.', ms: 9000, run: () => document.querySelector<HTMLElement>('[role="status"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }) },
  { say: 'A project starts with a question and the AI level the assessment allows. You approve the searches first.', ms: 8000, run: (c) => go(`/p/${c.pid}/plan`) },
  { say: 'These are real papers in a sample project. The map draws a line only where one paper really cites another or they share references.', ms: 9000, run: (c) => go(`/p/${c.pid}/map`) },
  { say: 'The team: nine agents with one job each, three gates, and nobody but you can open one.', ms: 8000, run: (c) => go(`/p/${c.pid}/team`) },
  { say: 'The Challenger looks for evidence against you and shows the exact sentence.', ms: 9000, run: (c) => go(`/p/${c.pid}/challenge`) },
  { say: 'The Integrity Lab tests our own checker in front of you.', ms: 7000, run: () => go('/lab') },
  { say: 'House rules: who does what, and what nobody can do. That is the tour.', ms: 7000, run: () => go('/rules') },
];

export function Tour() {
  const [at, setAt] = useState(-1);
  const [pid, setPid] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    const start = () => {
      // The tour is for anyone, so it uses the guest library when nobody is signed in.
      if (currentSession().kind === 'none') continueAsGuest();
      setNote('Looking up the sample sources…');
      setAt(-1);
      sampleProject()
        .then((id) => {
          setPid(id);
          setNote('');
          setAt(0);
        })
        .catch(() => setNote('The tour needs the registries, and none answered. Try again in a minute.'));
    };
    window.addEventListener('pt:tour', start);
    return () => window.removeEventListener('pt:tour', start);
  }, []);

  useEffect(() => {
    if (at < 0) return;
    const s = STEPS[at];
    if (!s) {
      setAt(-1);
      return;
    }
    try {
      void s.run({ pid });
    } catch {
      /* storage blocked: the page still opens */
    }
    const timer = setTimeout(() => setAt((c) => c + 1), s.ms);
    const stop = (e: Event) => {
      if (!(e.target instanceof Element && e.target.closest('[data-tour]'))) setAt(-1);
    };
    // Any touch, click, wheel or key outside the bar hands control back.
    const names = ['pointerdown', 'wheel', 'keydown'] as const;
    names.forEach((n) => window.addEventListener(n, stop, { passive: true }));
    return () => {
      clearTimeout(timer);
      names.forEach((n) => window.removeEventListener(n, stop));
    };
  }, [at, pid]);

  if (at < 0 && !note) return null;
  return (
    <aside className={css.bar} data-tour role="status" aria-live="polite" aria-label="Tour">
      <span className="sample">SAMPLE</span>
      <p>{note || STEPS[at]?.say}</p>
      {at >= 0 && <span className={css.n}>{at + 1} of {STEPS.length}</span>}
      {at >= 0 && (
        <button className="btn" type="button" onClick={() => setAt((c) => c + 1)}>
          Next
        </button>
      )}
      <button className="btn" type="button" onClick={() => { setAt(-1); setNote(''); }}>
        Stop
      </button>
    </aside>
  );
}
