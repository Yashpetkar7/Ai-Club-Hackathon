import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from '@/app/router';
import type { StepProps } from '@/app/ProjectShell';
import { titleOf } from '@/core/cite/preflight';
import { judge, type Support } from '@/core/claims/label';
import { rankSentences, type Ranked } from '@/core/claims/rank';
import { removeClaim, saveClaim } from '@/core/claims/store';
import { cancelSupport, loadSupport, onSupport, scoreSupport, SUPPORT_MB, SUPPORT_MODEL, supportState } from '@/core/claims/support';
import { CLAIM_TEXT, REASON_TEXT, type Claim, type ClaimChecks, type Source } from '@/core/contracts';
import { pageAt, pageText } from '@/core/pdf/pages';
import { registries } from '@/core/registries';
import { record as log } from '@/log/log';
import { POLICY } from '@/policy/policy';
import { editSource } from '@/store/actions';
import { db } from '@/store/db';
import { CLAIM_HANDOFF } from '@/pages/Read';
import { ClaimStamp, VerdictStamp } from '@/ui/Stamp';
import css from './Evidence.module.css';

const CHECKS: [keyof ClaimChecks, string][] = [
  ['exactQuote', 'The sentence is in the source, exactly'],
  ['numbers', 'Numbers match, for the same thing'],
  ['direction', 'Same direction'],
  ['scope', 'Not wider or more certain'],
];

/** The source text with one exact slice marked. */
function Marked({ text, at }: { text: string; at: { start: number; end: number } | undefined }) {
  if (!at) return <>{text}</>;
  return (
    <>
      {text.slice(0, at.start)}
      <mark className={css.mark} key={at.start} ref={(el) => el?.scrollIntoView?.({ block: 'nearest' })}>
        {text.slice(at.start, at.end)}
      </mark>
      {text.slice(at.end)}
    </>
  );
}

export function Evidence({ project }: StepProps) {
  const sources = useLiveQuery(() => db.sources.where('projectId').equals(project.id).toArray(), [project.id]);
  const claims = useLiveQuery(() => db.claims.where('projectId').equals(project.id).reverse().sortBy('createdAt'), [project.id]) ?? [];
  const model = useSyncExternalStore(onSupport, supportState);
  const [sourceId, setSourceId] = useState('');
  const [claim, setClaim] = useState('');
  const [ranked, setRanked] = useState<Ranked[] | null>(null);
  const [pick, setPick] = useState(0);
  const [support, setSupport] = useState<Support | null>(null);
  const [scoring, setScoring] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [said, setSaid] = useState('');
  const [was, setWas] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const handed = useRef<{ sourceId: string; text: string } | null>(null);
  useEffect(() => {
    // Kept in a ref because React mounts effects twice in development.
    try {
      const raw = sessionStorage.getItem(CLAIM_HANDOFF);
      if (raw) handed.current = JSON.parse(raw) as { sourceId: string; text: string };
      sessionStorage.removeItem(CLAIM_HANDOFF);
    } catch {
      /* storage blocked: start empty */
    }
    if (handed.current) {
      setSourceId(handed.current.sourceId);
      setClaim(handed.current.text);
    }
  }, []);

  const kept = sources ?? [];
  const source: Source | undefined = kept.find((s) => s.id === sourceId) ?? kept.find((s) => s.text) ?? kept[0];
  const passage = ranked?.[pick];
  const where = source && passage ? pageAt(source, passage.start, passage.end) : null;
  const judged = useMemo(() => (ranked && source ? judge(claim, source, passage?.text, support) : null), [ranked, source, claim, passage, support]);

  function find(e?: React.FormEvent) {
    e?.preventDefault();
    setError('');
    setSaid('');
    setReason('');
    setSupport(null);
    setPick(0);
    if (!source) return;
    setRanked(source.text ? rankSentences(source.text, claim) : []);
  }

  // Score the chosen sentence whenever the model is ready. One sentence at a time, on this device.
  useEffect(() => {
    if (!passage || model.status !== 'ready') return;
    let live = true;
    setScoring(true);
    setSupport(null);
    scoreSupport(passage.text, claim)
      .then(async (s) => {
        if (!live) return;
        setSupport(s);
        await log(project.id, 'code', 'support.model-ran', `${SUPPORT_MODEL} on this device | support ${s.entails.toFixed(2)}, contradiction ${s.contradicts.toFixed(2)}`);
      })
      .catch(() => live && setSupport(null))
      .finally(() => live && setScoring(false));
    return () => {
      live = false;
    };
  }, [passage?.start, ranked, model.status]);

  async function getText(s: Source) {
    setFetching(true);
    setError('');
    try {
      const rec = s.record?.doi ? await registries.openalexByDoi(s.record.doi) : null;
      if (rec?.abstract) await editSource(s.id, { text: rec.abstract, textOrigin: 'abstract' });
      else setError('OpenAlex has no abstract for this source. Add its PDF instead.');
    } catch {
      setError('OpenAlex did not answer. Try again in a minute, or add the PDF.');
    }
    setFetching(false);
  }

  async function decide(decision: 'accepted' | 'rejected') {
    setError('');
    try {
      const c = await saveClaim({
        projectId: project.id,
        text: claim,
        decision: decision === 'accepted' && was && was !== claim.trim() ? 'rewritten' : decision,
        support,
        reason,
        ...(source ? { source } : {}),
        ...(passage ? { passage: { text: passage.text, start: passage.start, end: passage.end } } : {}),
      });
      setSaid(decision === 'rejected' ? 'Rejected. It stays in the log.' : `Saved as ${CLAIM_TEXT[c.label].label}.`);
      setRanked(null);
      setClaim((now) => (now === claim ? '' : now));
      setReason('');
      setWas(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    }
  }

  if (!sources) return <p className="soft">Opening your library…</p>;
  if (kept.length === 0)
    return (
      <>
        <h1>Evidence</h1>
        <div className={`card ${css.empty}`}>
          <h2>No sources to look in yet</h2>
          <p className="soft">
            <Link to={`/p/${project.id}/find`}>Keep a source</Link> first. Then write a claim and we show you the exact sentence that supports it, or say that none does.
          </p>
        </div>
      </>
    );

  const t = judged && CLAIM_TEXT[judged.label];
  return (
    <>
      <div className="stack">
        <h1>Evidence</h1>
        <p className="soft">Write what you want to say. We find the closest sentence in the source and plain code compares the two. Verified means the source says it. It does not mean the source is right.</p>
      </div>

      <form className={css.ask} onSubmit={find}>
        <label className="stack">
          <strong>Source</strong>
          <select
            className="field"
            value={source?.id ?? ''}
            onChange={(e) => {
              setSourceId(e.target.value);
              setRanked(null);
              setSupport(null);
              setError('');
            }}
          >
            {kept.map((s) => (
              <option key={s.id} value={s.id}>
                {titleOf(s).slice(0, 110)}
                {s.text ? '' : ' (no text yet)'}
              </option>
            ))}
          </select>
        </label>
        <label className="stack">
          <strong>Your claim</strong>
          <textarea
            className={`field ${css.claim}`}
            value={claim}
            placeholder="Home working led to a 13% performance increase."
            onChange={(e) => {
              setClaim(e.target.value);
              setRanked(null);
              setSupport(null);
            }}
          />
        </label>
        <div className="row">
          <button className="btn main" type="submit" disabled={claim.trim().split(/\s+/).length < 3 || !source?.text}>
            Find the sentence
          </button>
          {source?.check && <VerdictStamp verdict={source.check.verdict} />}
          {source?.textOrigin === 'abstract' && <span className="soft">Only the abstract can be read.</span>}
        </div>
        {source && !source.text && (
          <div className={css.notext}>
            <p>We have no text for this source, so nothing can be compared with it.</p>
            <div className="row">
              {source.record?.doi && (
                <button className="btn" type="button" disabled={fetching} onClick={() => void getText(source)}>
                  {fetching ? 'Asking OpenAlex…' : 'Get the abstract'}
                </button>
              )}
              <Link to={`/p/${project.id}/library`}>Add its PDF in the library</Link>
            </div>
          </div>
        )}
      </form>

      {ranked && source && judged && (
        <section className={css.result} aria-label="Result">
          <div className={css.left}>
            <h2>In the source</h2>
            {passage ? (
              <>
                <p className={css.page}>{where ? pageText(where) : source.textOrigin === 'abstract' ? 'In the abstract, which has no page numbers. Add the PDF to get one.' : 'This text has no page numbers.'}</p>
                <p className={css.source} tabIndex={0} role="region" aria-label="Text of the source">
                  <Marked text={source.text!} at={passage} />
                </p>
                {ranked.length > 1 && (
                  <fieldset className={css.others}>
                    <legend>Closest sentences</legend>
                    {ranked.map((r, i) => (
                      <label key={r.start}>
                        <input type="radio" name="sentence" checked={pick === i} onChange={() => setPick(i)} /> <span>{r.text}</span>
                      </label>
                    ))}
                  </fieldset>
                )}
              </>
            ) : (
              <>
                <p className={css.none}>No sentence in this source is close to your claim.</p>
                <p className={css.source} tabIndex={0} role="region" aria-label="Text of the source">
                  {source.text}
                </p>
              </>
            )}
          </div>
          <div className={css.right} data-label={judged.label}>
            <div role="status" aria-live="polite" className="stack">
              <span className="land" key={judged.label}>
                <ClaimStamp label={judged.label} />
              </span>
              <p>{t!.plain}</p>
              {judged.reasons.length > 0 && (
                <ul className={css.reasons}>
                  {judged.reasons.map((r) => (
                    <li key={r}>{REASON_TEXT[r]}</li>
                  ))}
                </ul>
              )}
            </div>
            <table className={css.checks}>
              <tbody>
                {CHECKS.map(([k, n]) => {
                  const v = judged.checks[k];
                  return (
                    <tr key={k} data-v={String(v)}>
                      <th scope="row">{n}</th>
                      <td>{v === true ? '✓ yes' : v === false ? '≠ no' : 'nothing to check'}</td>
                    </tr>
                  );
                })}
                <tr data-v={judged.wordForWord ? 'true' : judged.checks.support === null ? 'null' : String(judged.checks.support >= POLICY.thresholds.supportVerified)}>
                  <th scope="row">The sentence says your claim</th>
                  <td>{judged.wordForWord ? '✓ word for word' : scoring ? 'checking…' : judged.checks.support !== null ? `model: ${Math.round(judged.checks.support * 100)}%` : 'not checked'}</td>
                </tr>
              </tbody>
            </table>
            {judged.wordForWord && claim.trim().split(/\s+/).length >= 8 && <p className={css.own}>These are the source’s own words. Put them in quotation marks, or say it in your own words.</p>}
            {!judged.wordForWord && passage && <ModelBox state={model} />}
            <div className={css.decide}>
              <p>
                <strong>Gate 3.</strong> Your decision.
              </p>
              {judged.label !== 'verified' && (
                <label className="stack">
                  <span>
                    To keep this anyway, say why. <span className="soft">At least {POLICY.overrideReasonMinChars} characters.</span>
                  </span>
                  <textarea className="field" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                </label>
              )}
              <div className="row">
                <button className="btn main" type="button" disabled={scoring} onClick={() => void decide('accepted')}>
                  Accept
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    setWas(claim.trim());
                    setRanked(null);
                    document.querySelector<HTMLTextAreaElement>(`.${css.claim}`)?.focus();
                  }}
                >
                  Rewrite
                </button>
                <button className="btn quiet" type="button" onClick={() => void decide('rejected')}>
                  Reject
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
      {error && (
        <p role="alert" className={css.error}>
          {error}
        </p>
      )}
      <p role="status" className="soft">
        {said}
      </p>

      {claims.length > 0 && (
        <section className="stack">
          <h2>Your claims ({claims.length})</h2>
          <ul className={css.list}>
            {claims.map((c) => (
              <ClaimCard key={c.id} c={c} source={kept.find((s) => s.id === c.sourceId)} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function ClaimCard({ c, source }: { c: Claim; source: Source | undefined }) {
  return (
    <li className={`card ${css.card}`} data-decision={c.decision}>
      <p className={css.text}>{c.text}</p>
      <div className="row">
        <ClaimStamp label={c.label} />
        <span className="soft">{c.decision === 'accepted' ? 'You accepted this' : c.decision === 'rewritten' ? 'You rewrote and accepted this' : 'You rejected this'}</span>
        <button className="btn quiet" type="button" onClick={() => void removeClaim(c.id)}>
          Remove
        </button>
      </div>
      {c.passage && <blockquote>“{c.passage.text}”</blockquote>}
      {c.passage && (
        <p className="soft">
          {source ? titleOf(source) : 'The source was removed from your library.'}
          {c.passage.page ? ` · ${pageText({ ...c.passage, page: c.passage.page })}` : ''}
        </p>
      )}
      {c.reasons.length > 0 && <p className="soft">{c.reasons.map((r) => REASON_TEXT[r]).join(' ')}</p>}
      {c.keptWithReason && <p className={css.why}>Your reason: {c.keptWithReason}</p>}
    </li>
  );
}

function ModelBox({ state }: { state: ReturnType<typeof supportState> }) {
  if (state.status === 'ready') return <p className="soft">The support model is on this device. It scores one sentence at a time and writes nothing.</p>;
  if (state.status === 'loading')
    return (
      <div className={css.model}>
        <label className="stack">
          <span>
            Downloading the support model{state.total ? `, ${Math.round(state.loaded / 1e6)} of ${Math.round(state.total / 1e6)} MB` : ''}
          </span>
          <progress {...(state.total ? { value: state.loaded, max: state.total } : {})} />
        </label>
        <button className="btn" type="button" onClick={cancelSupport}>
          Cancel
        </button>
      </div>
    );
  return (
    <div className={css.model}>
      {state.status === 'failed' && <p role="alert">{state.why}</p>}
      <p className="soft">Your words differ from the source’s. A small model can compare the meaning on this device. It downloads about {SUPPORT_MB} MB once, and your claim is not sent anywhere.</p>
      <button className="btn" type="button" onClick={loadSupport}>
        Compare the meaning
      </button>
    </div>
  );
}
