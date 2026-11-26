import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from '@/app/router';
import type { Project, Source } from '@/core/contracts';
import { db } from '@/store/db';
import css from './Signposts.module.css';

/** What a page needs besides having sources: approved ones, and text it can read. */
export type Need = 'approved' | 'text';
export interface Fix { to: string; label: string; why: string }

/**
 * The first thing missing, in the order the trail fixes it, and the one page that fixes it.
 * Null when nothing is missing. It reads the library and changes nothing.
 */
export function firstFix(project: Pick<Project, 'id' | 'plan'>, sources: Pick<Source, 'keys' | 'check' | 'text'>[], needs: readonly Need[] = []): Fix | null {
  const at = (step: string) => `/p/${project.id}/${step}`;
  if (!sources.length)
    return project.plan?.approvedAt
      ? { to: at('find'), label: 'Find sources', why: 'Your library is empty.' }
      : { to: at('plan'), label: 'Plan your searches', why: 'Your library is empty, and nothing is searched until you approve a plan.' };
  const pool = needs.includes('approved') ? sources.filter((s) => s.keys.approved && s.check?.verdict !== 'retracted') : sources;
  if (!pool.length) return { to: at('library'), label: 'Approve sources in Library', why: 'You have no approved sources yet.' };
  if (needs.includes('text') && !pool.some((s) => s.text?.trim())) return { to: at('read'), label: 'Get the text in Read', why: 'None of these sources has text we can read yet.' };
  return null;
}

/** Words for a page where an empty library is not a dead end, so the button is only an offer. */
const LEAD = {
  challenge: 'Challenge searches the registries even when your library is empty. To weigh your own papers as well, add some first.',
} as const;

/** One clear button out of an empty page. It shows nothing while the library opens or when nothing is missing. */
export function FixFirst({ project, needs = [], say = false, on }: { project: Project; needs?: readonly Need[]; say?: boolean; on?: keyof typeof LEAD }) {
  const sources = useLiveQuery(() => db.sources.where('projectId').equals(project.id).toArray(), [project.id]);
  const fix = sources ? firstFix(project, sources, needs) : null;
  if (!fix) return null;
  const lead = on ? LEAD[on] : say ? fix.why : '';
  return (
    <p className={css.fix}>
      {lead && <span>{lead}</span>}
      <Link to={fix.to} className={on ? 'btn' : 'btn main'}>
        {fix.label}
      </Link>
    </p>
  );
}

const SEE = {
  check: { lead: 'Want to know whether each sentence says what its source says?', to: '/audit', label: 'Audit a whole paragraph' },
  evidence: { lead: 'A whole paragraph with its reference list? Audit checks every claim in it at once. Nothing there is saved to this project.', to: '/audit', label: 'Audit a whole paragraph' },
  'lab-claims': { lead: 'Try the same claim checker on your own writing.', to: '/audit', label: 'Audit a paragraph' },
  'lab-refs': { lead: 'Try the same reference checker on your own list.', to: '/check', label: 'Check references' },
} as const;

/** A short pointer to a related page. The words live here, so the pages that use it get one line each. */
export function SeeAlso({ from }: { from: keyof typeof SEE }) {
  const s = SEE[from];
  return (
    <p className={css.see}>
      {s.lead} <Link to={s.to}>{s.label}</Link>
    </p>
  );
}
