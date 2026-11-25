import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { titleOf } from '@/core/cite/preflight';
import type { Project, Source } from '@/core/contracts';
import { better, findDuplicates, isPreprint, type Pair } from '@/core/library/duplicates';
import { mergeSources, notTheSame } from '@/core/library/merge';
import { watchLibrary, type Watched } from '@/core/library/watch';
import { db } from '@/store/db';
import { Stamp, VerdictStamp } from '@/ui/Stamp';
import css from './Library.module.css';

const when = (iso: string): string => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const n = (k: number, one: string, many = `${one}s`): string => `${k} ${k === 1 ? one : many}`;

/** Asks the registries about every source again, and about the reference list of each one. */
export function RetractionCheck({ project, sources }: { project: Project; sources: Source[] }) {
  const last = useLiveQuery(async () => (await db.log.where('projectId').equals(project.id).toArray()).filter((e) => e.action === 'library.watched').at(-1), [project.id]);
  const [step, setStep] = useState<{ n: number; of: number; title: string } | null>(null);
  const [got, setGot] = useState<Watched | null>(null);
  const [error, setError] = useState('');
  const stop = useRef(false);
  const able = sources.filter((s) => s.record).length;

  async function run() {
    stop.current = false;
    setGot(null);
    setError('');
    setStep({ n: 0, of: able, title: '' });
    try {
      setGot(await watchLibrary(project.id, (k, of, title) => setStep({ n: k, of, title }), () => stop.current));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    }
    setStep(null);
  }

  const lines: [string, string[], 'bad' | 'warn' | 'mute'][] = got
    ? [
        ['Retracted', got.retracted, 'bad'],
        ['Expression of concern', got.concern, 'warn'],
        ['Corrected after publication', got.corrected, 'warn'],
        ['Cites retracted work', got.leaning, 'warn'],
        ['Not answered, earlier result kept', got.unsure, 'mute'],
      ]
    : [];
  return (
    <section className={css.watch} aria-label="Retraction check">
      <div className={css.watchHead}>
        <div>
          <h2>Retraction check</h2>
          <p className="soft">Asks Crossref, which carries Retraction Watch, and OpenAlex about every source again, and whether a source cites retracted work. {last ? `Last done ${when(last.at)}.` : 'Not done yet.'}</p>
        </div>
        {step ? (
          <button className="btn" type="button" onClick={() => { stop.current = true; }}>
            Stop
          </button>
        ) : (
          <button className="btn" type="button" disabled={able === 0} onClick={() => void run()}>
            Check all for retractions
          </button>
        )}
      </div>
      <div role="status" aria-live="polite">
        {step && (
          <p>
            Checking {step.n} of {step.of}. <span className="soft">{step.title.slice(0, 90)}</span>
          </p>
        )}
        {got && (
          <div className="stack">
            <p>
              <strong>
                {n(got.checked, 'source')} checked.{' '}
                {got.retracted.length + got.concern.length + got.corrected.length + got.leaning.length === 0 ? (got.checked === 0 ? '' : got.unsure.length || got.stopped ? 'Nothing found in those that answered.' : 'No retraction, warning or correction found.') : ''}
                {got.stopped ? ' Stopped by you.' : ''}
                {got.silent ? ' The registries are not answering, so we stopped asking. Check your connection and try again.' : ''}
              </strong>
            </p>
            <ul className={css.watchList}>
              {lines
                .filter(([, l]) => l.length)
                .map(([t, l, tone]) => (
                  <li key={t}>
                    <Stamp tone={tone} mark={tone === 'bad' ? '✕' : tone === 'warn' ? '≠' : '…'}>
                      {t} ({l.length})
                    </Stamp>
                    <span>{l.join('; ')}</span>
                  </li>
                ))}
            </ul>
            <p className="soft">
              A clear result means none of these registries lists one today. {got.noList > 0 ? `${n(got.noList, 'source')} ${got.noList === 1 ? 'has' : 'have'} no reference list in OpenAlex, so we cannot say what ${got.noList === 1 ? 'it cites' : 'they cite'}.` : ''}
            </p>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className={css.error}>
          {error}
        </p>
      )}
    </section>
  );
}

/** Two records that look like one work. Nothing is merged until the student says so. */
export function Duplicates({ project, sources }: { project: Project; sources: Source[] }) {
  const pairs = findDuplicates(sources).filter((p) => !project.notTheSame?.includes(p.key));
  const [said, setSaid] = useState('');
  const [error, setError] = useState('');
  if (!pairs.length) return said ? <p role="status">{said}</p> : null;

  async function keep(k: Source, d: Source) {
    setError('');
    try {
      const m = await mergeSources(k.id, d.id);
      setSaid(`Kept one, removed one.${m.moved ? ` ${n(m.moved, 'claim')} moved.` : ''}${m.left ? ` ${n(m.left, 'claim')} stayed with the removed one, because ${m.left === 1 ? 'its words are' : 'their words are'} not in the text we have.` : ''} If your draft cites the removed one, Write will show it.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    }
  }
  return (
    <section className={css.dups} aria-label="Possible duplicates">
      <h2>{n(pairs.length, 'possible duplicate')}</h2>
      <p className="soft">These look like one work saved twice. Cite the version you read. Your tags and notes move to the one you keep.</p>
      {pairs.slice(0, 5).map((p) => (
        <PairCard key={p.key} p={p} onKeep={keep} onBoth={() => void notTheSame(project.id, p.key, `${titleOf(p.a)} | ${titleOf(p.b)}`)} />
      ))}
      {pairs.length > 5 && <p className="soft">{pairs.length - 5} more after these.</p>}
      <p role="status">{said}</p>
      {error && (
        <p role="alert" className={css.error}>
          {error}
        </p>
      )}
    </section>
  );
}

function PairCard({ p, onKeep, onBoth }: { p: Pair; onKeep: (k: Source, d: Source) => Promise<void>; onBoth: () => void }) {
  const best = better(p.a, p.b);
  return (
    <div className={`card ${css.pair}`}>
      <p>
        <strong>{p.why}</strong>
      </p>
      <div className={css.two}>
        {[p.a, p.b].map((s) => (
          <div key={s.id} className="stack">
            <span className={css.title}>{titleOf(s)}</span>
            <span className="soft">
              {s.record?.year ?? 'year not stated'}
              {s.record?.container ? ` · ${s.record.container}` : ''}
              {isPreprint(s.record) ? ' · preprint' : ''}
              {s.record?.doi ? ` · ${s.record.doi}` : ''}
            </span>
            <span className="row">
              {s.check && <VerdictStamp verdict={s.check.verdict} />}
              {s.keys.approved && <span className="soft">approved by you</span>}
            </span>
            <button className={`btn${s.id === best.id ? ' main' : ''}`} type="button" aria-label={`Keep this one: ${s.record?.container ?? s.record?.doi ?? titleOf(s)}`} onClick={() => void onKeep(s, s.id === p.a.id ? p.b : p.a)}>
              Keep this one
            </button>
          </div>
        ))}
      </div>
      <button className="btn quiet" type="button" onClick={onBoth}>
        They are different works
      </button>
    </div>
  );
}
