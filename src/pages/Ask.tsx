import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { readPassages } from '@/agents/reader';
import { Link } from '@/app/router';
import type { StepProps } from '@/app/ProjectShell';
import { citeKey } from '@/core/cite/csl';
import { titleOf } from '@/core/cite/preflight';
import { askLibrary, type Asked } from '@/core/claims/rank';
import type { Source } from '@/core/contracts';
import { pageAt, pageText } from '@/core/pdf/pages';
import { record as log } from '@/log/log';
import { agentAllowed } from '@/policy/policy';
import { recordAiDecision } from '@/store/actions';
import { db } from '@/store/db';
import { VerdictStamp } from '@/ui/Stamp';
import css from './Ask.module.css';

interface Line { text: string; source: Source }
interface Answer { question: string; asked: Asked; ai?: { model: string; lines: Line[] }; aiNote?: string }

const who = (s: Source): string => {
  const a = s.record?.authors.map((x) => x.family) ?? s.raw?.authors ?? [];
  return [a.length ? `${a.slice(0, 2).join(', ')}${a.length > 2 ? ' et al.' : ''}` : 'No author listed', citeKey(s).year ?? 'year not stated'].join(' · ');
};

export function Ask({ project }: StepProps) {
  const sources = useLiveQuery(() => db.sources.where('projectId').equals(project.id).toArray(), [project.id]);
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [decided, setDecided] = useState<Record<string, 'kept' | 'rejected'>>({});
  if (!sources) return <p className="soft">Opening your library…</p>;
  // Only what the student approved. A source they have not decided on is not theirs to quote yet.
  const kept = sources.filter((s) => s.keys.approved && s.check?.verdict !== 'retracted');
  const aiOn = agentAllowed('reader', project.aiLevel);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const question = q.trim();
    const asked = askLibrary(question, kept);
    setDecided({});
    setAnswer({ question, asked });
    void log(project.id, 'student', 'library.asked', `${question.slice(0, 200)} | ${asked.hits.length} sentences from ${new Set(asked.hits.map((h) => h.source.id)).size} sources`);
    if (!aiOn) return;
    setBusy(true);
    const r = await readPassages(project, question, kept);
    setBusy(false);
    setAnswer((cur) => {
      if (cur?.question !== question) return cur;
      if (!r.ok) return { ...cur, aiNote: r.reason === 'cap' ? 'This project has used all its AI calls, so plain code answered alone.' : 'The AI Reader is not available, so plain code answered alone.' };
      const have = new Set(asked.hits.map((h) => h.sentence.text));
      const lines = r.data.map((p) => ({ text: p.text, source: p.source })).filter((l) => !have.has(l.text));
      return lines.length ? { ...cur, ai: { model: r.model, lines } } : { ...cur, aiNote: 'The AI Reader pointed at nothing new.' };
    });
  }

  function choose(text: string, what: 'kept' | 'rejected') {
    setDecided((d) => ({ ...d, [text]: what }));
    void recordAiDecision(project.id, 'read', { kept: what === 'kept' ? [text.slice(0, 160)] : [], changed: [], rejected: what === 'rejected' ? [text.slice(0, 160)] : [] });
  }

  const a = answer?.asked;
  const groups = a ? [...new Map(a.hits.map((h) => [h.source.id, h.source])).values()] : [];
  return (
    <>
      <div className="stack">
        <h1>Ask your library</h1>
        <p className="soft">The answer is made only of exact sentences from sources you approved, each with its source. If your library does not say, we tell you. {aiOn ? 'At this level the AI Reader may also point at sentences. It cannot add words.' : 'No AI takes part.'}</p>
      </div>
      <form className="stack" onSubmit={(e) => void ask(e)}>
        <label htmlFor="ask-q">
          <strong>Your question</strong>
        </label>
        <div className={css.bar}>
          <input id="ask-q" className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="How did home working affect performance?" />
          <button className="btn main" type="submit" disabled={q.trim().split(/\s+/).length < 2 || kept.length === 0}>
            Ask
          </button>
        </div>
        {kept.length === 0 && (
          <p className="soft">
            You have no approved sources yet. <Link to={`/p/${project.id}/library`}>Approve some in your library</Link>.
          </p>
        )}
      </form>

      {a && (
        <section className="stack" aria-label="Answer" aria-live="polite">
          {a.hits.length === 0 ? (
            <div className={css.notfound}>
              <h2>Not found in your library</h2>
              <p>None of the {a.searched.length} {a.searched.length === 1 ? 'source' : 'sources'} we could read has a sentence that answers this. That does not mean nobody has studied it.</p>
              <Link to={`/p/${project.id}/plan`} className="btn">
                Search for more sources
              </Link>
            </div>
          ) : (
            <>
              <h2>What your sources say</h2>
              {groups.map((s) => (
                <article key={s.id} className={`card ${css.group}`}>
                  {a.hits.filter((h) => h.source.id === s.id).map((h) => (
                    <blockquote key={h.sentence.start}>
                      “{h.sentence.text}”{pageAt(s, h.sentence.start, h.sentence.end) && <small className="soft"> {pageText(pageAt(s, h.sentence.start, h.sentence.end)!)}</small>}
                    </blockquote>
                  ))}
                  <p className={css.who}>
                    <strong>{titleOf(s)}</strong>
                    <br />
                    {who(s)}
                    {s.record?.doi && (
                      <>
                        {' · '}
                        <a href={`https://doi.org/${s.record.doi}`} target="_blank" rel="noreferrer">
                          Open the source
                        </a>
                      </>
                    )}
                  </p>
                  <div className="row">
                    {s.check && <VerdictStamp verdict={s.check.verdict} />}
                    {s.textOrigin === 'abstract' && <span className="soft">From the abstract</span>}
                    {s.keptWithReason && <span className="soft">Kept with your reason</span>}
                  </div>
                </article>
              ))}
            </>
          )}
          {busy && <p className="soft">The AI Reader is looking too…</p>}
          {answer!.aiNote && <p className="soft">{answer!.aiNote}</p>}
          {answer!.ai && (
            <div className="stack">
              <h3>Also pointed at by AI ({answer!.ai.model})</h3>
              <p className="soft">These are exact sentences from your sources. The AI chose them by number.</p>
              {answer!.ai.lines.map((l) => (
                <article key={l.text} className={`card ${css.group}`} data-choice={decided[l.text]}>
                  <blockquote>“{l.text}”</blockquote>
                  <p className={css.who}>
                    <strong>{titleOf(l.source)}</strong>
                    <br />
                    {who(l.source)}
                  </p>
                  {decided[l.text] ? (
                    <span className="soft">{decided[l.text] === 'kept' ? 'Marked useful' : 'Marked not useful'}</span>
                  ) : (
                    <div className="row">
                      <button className="btn" type="button" onClick={() => choose(l.text, 'kept')}>
                        Useful
                      </button>
                      <button className="btn quiet" type="button" onClick={() => choose(l.text, 'rejected')}>
                        Not useful
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
          {a.ignored > 0 && <p className={css.warn}>{a.ignored === 1 ? 'One sentence was' : `${a.ignored} sentences were`} aimed at an AI and left out.</p>}
          <details>
            <summary>
              Where we looked: {a.searched.length} searched{a.unreadable.length ? `, ${a.unreadable.length} could not be read` : ''}
            </summary>
            <ul>
              {a.searched.map((s) => (
                <li key={s.id}>{titleOf(s)}</li>
              ))}
              {a.unreadable.map((s) => (
                <li key={s.id} className="soft">
                  {titleOf(s)} (no text to search)
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </>
  );
}
