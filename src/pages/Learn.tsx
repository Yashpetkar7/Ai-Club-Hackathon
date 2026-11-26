import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import type { StepProps } from '@/app/ProjectShell';
import { go, Link } from '@/app/router';
import { readPaper, PARTS } from '@/core/analyst/analyst';
import { saveFile } from '@/core/cite/save';
import { titleOf } from '@/core/cite/preflight';
import type { LogEvent, Source } from '@/core/contracts';
import { makeStudyEntry, studyFingerprint, studyProgress, studyDue, studyNotes, STUDY_STAGES, type StudyStage } from '@/core/learning/study';
import { rankResearch } from '@/core/research/priority';
import { record } from '@/log/log';
import { db } from '@/store/db';
import { CLAIM_HANDOFF } from './Read';
import { VerdictStamp } from '@/ui/Stamp';
import css from './Learn.module.css';
import { FixFirst } from './Signposts';

export function Learn({ project }: StepProps) {
  const sources = useLiveQuery(() => db.sources.where('projectId').equals(project.id).toArray(), [project.id]);
  const events = useLiveQuery(() => db.log.where('projectId').equals(project.id).sortBy('seq'), [project.id]);
  const [selected, setSelected] = useState('');
  if (!sources || !events) return <p className="soft" aria-busy="true">Opening your study trail…</p>;
  const items = sources.filter((s): s is Source & { record: NonNullable<Source['record']> } => !!s.record).map((s) => ({ ...s, key: s.id }));
  const order = [...rankResearch(items, project.question).map((r) => r.item), ...sources.filter((s) => !s.record)];
  const current = order.find((s) => s.id === selected) ?? order.find((s) => s.text?.trim()) ?? order[0];
  return <>
    <div className="stack"><h1>Study studio</h1><p className="soft">One paper, four short steps. Understand it, capture its evidence, question its limits, then try to recall it.</p></div>
    {!current ? <section className={`card ${css.panel}`}><h2>Your first study session</h2><p>Keep a paper in Find, then return here. Study uses the actual text in your library.</p><FixFirst project={project} /></section> : <>
      <label className="stack">Paper to study<select className="field" value={current.id} onChange={(e) => setSelected(e.target.value)}>{order.map((s) => <option key={s.id} value={s.id}>{titleOf(s)}{s.text?.trim() ? '' : ' · text needed'}</option>)}</select></label>
      <StudySession key={current.id} source={current} events={events} next={() => { const next = order[(order.findIndex((s) => s.id === current.id) + 1) % order.length]; if (next) setSelected(next.id); }} hasNext={order.length > 1} />
    </>}
  </>;
}

function StudySession({ source, events, next, hasNext }: { source: Source; events: LogEvent[]; next: () => void; hasNext: boolean }) {
  const [fingerprint, setFingerprint] = useState('');
  const [stage, setStage] = useState<StudyStage>('understand');
  const [note, setNote] = useState('');
  const [quote, setQuote] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setFingerprint(''); setStage('understand'); setNote(''); setQuote(''); setRevealed(false); setMessage(''); setError('');
    void studyFingerprint(source).then((f) => { if (active) setFingerprint(f); }, () => { if (active) setError('This browser could not identify the source text. Try reloading.'); });
    return () => { active = false; };
  }, [source.id, source.projectId, source.text, source.textOrigin, source.record?.doi, source.raw?.url]);
  const progress = useMemo(() => studyProgress(events, source, fingerprint), [events, source, fingerprint]);
  const reading = useMemo(() => readPaper(source.text ?? ''), [source.text]);
  const index = STUDY_STAGES.findIndex((s) => s.key === stage);
  const completed = Object.keys(progress).length;
  const available = STUDY_STAGES.slice(0, index).every((s) => !!progress[s.key]);
  const firstOpen = STUDY_STAGES.find((s) => !progress[s.key])?.key ?? 'recall';

  function choose(s: StudyStage) {
    setStage(s); setNote(progress[s]?.note ?? ''); setQuote(progress[s]?.quote ?? ''); setRevealed(false); setMessage(''); setError('');
  }
  async function save(confidence?: 'ready' | 'revisit') {
    if (busy || !available) return;
    setBusy(true); setError('');
    try {
      const current = await db.sources.get(source.id);
      if (!current || await studyFingerprint(current) !== fingerprint) throw new Error('The source text changed or was removed. Reopen the paper before saving.');
      const entry = makeStudyEntry(current, fingerprint, stage, { note, quote, ...(confidence ? { confidence } : {}) });
      await record(source.projectId, 'student', 'learning.completed', JSON.stringify(entry));
      setMessage(stage === 'recall' ? 'Self-assessment saved. This does not certify understanding or approve the source.' : 'Step saved to your evidence log.');
      if (index < STUDY_STAGES.length - 1) { setStage(STUDY_STAGES[index + 1]!.key); setNote(''); setQuote(''); setRevealed(false); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Your answer is still here.'); }
    finally { setBusy(false); }
  }
  function checkPassage() {
    const text = progress.capture?.quote;
    if (!text) return;
    try { sessionStorage.setItem(CLAIM_HANDOFF, JSON.stringify({ sourceId: source.id, text })); go(`/p/${source.projectId}/evidence`); }
    catch { setError('Your browser blocked the handoff. Copy the passage and open Evidence.'); }
  }

  return <div className="stack">
    <div className={`card ${css.context}`}>
      <strong>{titleOf(source)}</strong>
      <div className="row">{source.check ? <VerdictStamp verdict={source.check.verdict} /> : <span>Not checked</span>}{source.check?.sample && <span className="sample">SAMPLE</span>}<span>Reading: {source.textOrigin === 'abstract' ? 'abstract only' : source.textOrigin ?? 'no text yet'}</span></div>
      <p className="soft">Study completion records your effort. It does not change the checker verdict, claim support or your citation approval. Uploaded text is not automatically authenticated as the published paper.</p>
    </div>
    {!source.text?.trim() ? <section className={`card ${css.panel}`}><h2>Bring the text into your library</h2><p>Open Read to fetch an available abstract, or add a PDF in Library. We will not create a summary of text we cannot read.</p><div className="row"><Link className="btn" to={`/p/${source.projectId}/read`}>Get an abstract</Link><Link className="btn" to={`/p/${source.projectId}/library`}>Add a PDF</Link></div></section> : <>
      <section className={css.progress} aria-label="Study progress"><div className="row"><strong>{completed} of 4 steps recorded</strong>{studyDue(progress) && <span>Ready for another recall session</span>}<button className="btn quiet" type="button" onClick={() => choose(firstOpen)}>Resume my trail</button></div><progress max={4} value={completed} aria-label="Steps recorded" /><p className="soft">Progress is saved in this library and follows this exact version of the source text.</p></section>
      <div className={css.stages} role="group" aria-label="Study stages">{STUDY_STAGES.map((s, i) => <button key={s.key} className={css.stage} type="button" aria-pressed={s.key === stage} disabled={busy || !STUDY_STAGES.slice(0, i).every((p) => !!progress[p.key])} onClick={() => choose(s.key)}><strong>{s.title}</strong><span>{progress[s.key] ? 'Recorded' : 'To explore'}</span></button>)}</div>
      <div className={css.columns}>
        <section className={`card ${css.panel}`} aria-label="Study activity">
          <h2>{STUDY_STAGES[index]!.title}</h2><p>{STUDY_STAGES[index]!.prompt}</p>
          {stage === 'capture' ? <>
            <label className="stack">Exact passage<textarea className="field" rows={6} maxLength={6000} value={quote} onChange={(e) => setQuote(e.target.value)} /></label>
            <p className="soft">Paste from the available text or choose a passage beside this activity. Exact matching proves only that the words occur in this text.</p>
          </> : <label className="stack">{stage === 'recall' ? 'My answer from memory' : 'My own words'}<textarea className="field" rows={6} maxLength={4000} value={note} onChange={(e) => { setNote(e.target.value); if (stage === 'recall') setRevealed(false); }} /><span className="soft">{note.length}/4,000 characters. Saved as your reflection, never presented as a checked finding.</span></label>}
          {stage === 'recall' ? <>
            <button className="btn" type="button" disabled={note.trim().length < 20} onClick={() => setRevealed(true)}>Reveal source and compare</button>
            {revealed && <div className="stack"><p>Did your answer preserve the finding, population and limits? This is your self-assessment; no model grades it.</p><div className="row"><button className="btn" type="button" disabled={busy || !fingerprint} onClick={() => void save('revisit')}>I need another look</button><button className="btn main" type="button" disabled={busy || !fingerprint} onClick={() => void save('ready')}>Review again tomorrow</button></div></div>}
          </> : <button className="btn main" type="button" disabled={busy || !fingerprint || !available || (stage === 'capture' ? quote.trim().length < 24 : note.trim().length < 20)} onClick={() => void save()}>{busy ? 'Saving…' : 'Save and continue'}</button>}
          {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
        </section>
        <aside className={`card ${css.panel}`} aria-label="Source text">
          <h2>{stage === 'recall' && !revealed ? 'Try retrieval first' : 'The source’s own words'}</h2>
          {stage === 'recall' && !revealed ? <p>Write what you remember, then reveal the passages and compare. There is no timer or penalty.</p> : <>
            <p className="soft">Sorted using text rules. A category can be missing or mistaken; the words below are exact source passages.</p>
            <div className={css.passages} tabIndex={0} role="region" aria-label="Source passages">{PARTS.filter((p) => stage !== 'challenge' || ['limit', 'next', 'method', 'sample'].includes(p.key)).map((p) => <section key={p.key} className="stack"><h3>{p.title}</h3>{reading.parts[p.key].length ? reading.parts[p.key].slice(0, 2).map((s) => <div className="stack" key={s.start}><blockquote>{s.text}</blockquote>{stage === 'capture' && <button className="btn quiet" type="button" onClick={() => setQuote(s.text)}>Use this passage</button>}</div>) : <p className="soft">Not identified in the available text.</p>}</section>)}</div>
            <details><summary>Read all available text</summary><p className={css.fullText}>{source.text}</p></details>
          </>}
        </aside>
      </div>
      <div className={`card ${css.panel}`}><h2>Turn reading into research</h2><p>Take your selected passage to Evidence for a claim check, or save your notes for later.</p><div className="row"><button className="btn" type="button" disabled={!progress.capture} onClick={checkPassage}>Check captured passage</button><button className="btn" type="button" disabled={!completed} onClick={() => saveFile('study-notes.txt', studyNotes(source, progress))}>Download study notes</button><Link className="btn" to={`/p/${source.projectId}/challenge`}>Find the other side</Link>{hasNext && <button className="btn" type="button" onClick={next}>Study another paper</button>}</div></div>
    </>}
  </div>;
}
