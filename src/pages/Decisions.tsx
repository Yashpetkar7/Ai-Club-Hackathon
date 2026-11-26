import { useLiveQuery } from 'dexie-react-hooks';
import { useId, useState } from 'react';
import type { Source } from '@/core/contracts';
import { STATUS_PLAIN, statusOf } from '@/core/verify/status';
import { POLICY } from '@/policy/policy';
import { acceptFix, acknowledgeRetraction, decisionsFor, rejectFix, suggested } from '@/store/decisions';
import { db } from '@/store/db';
import css from './Decisions.module.css';

const FIELD = { title: 'Title', authors: 'Authors', year: 'Year', doi: 'DOI', container: 'Journal', volume: 'Volume', issue: 'Issue', pages: 'Pages' } as const;
const REG: Record<string, string> = { crossref: 'Crossref', openalex: 'OpenAlex', datacite: 'DataCite', 'doi.org': 'doi.org', 'retraction-watch': 'Retraction Watch' };

/** Status line with last checked time and every database asked. */
export function StatusLine({ s }: { s: Source }) {
  const st = statusOf(s.check);
  const asked = [...new Set((s.check?.trace ?? []).map((t) => REG[t.registry] ?? t.registry))];
  return (
    <div className={css.status} data-status={st}>
      <p>
        <strong>{st}</strong> {s.check?.verdict === 'web-source' ? 'Web source. ' : ''}
        {STATUS_PLAIN[st]}
      </p>
      <p className="soft">
        {s.check ? `Last checked ${new Date(s.check.checkedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Not checked yet'}
        {asked.length ? ` · Databases asked: ${asked.join(', ')}` : ''}
      </p>
    </div>
  );
}

/** Case 3 and Case 2. Each wrong field: what you wrote, what the database holds, where from, and your decision. */
export function FixPanel({ s }: { s: Source }) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');
  const c = s.check;
  const accepted = (s.fixes ?? []).filter((f) => f.decision === 'accepted');
  if (c && accepted.length && !['details-differ', 'wrong-paper'].includes(c.verdict))
    return (
      <section className={css.panel} aria-label="Fixes you accepted" data-kind="fix">
        <h3>Checked again after your fix: {statusOf(c)}</h3>
        <ul>
          {accepted.map((f, i) => (
            <li key={i}>
              {FIELD[f.field]}: {f.from} → {f.to} <span className="soft">({f.evidence})</span>
            </li>
          ))}
        </ul>
        {s.original && <p className="soft">Your original submission is kept in the audit history: “{s.original.raw}”</p>}
      </section>
    );
  if (!c || !s.raw || !['details-differ', 'wrong-paper'].includes(c.verdict)) return null;
  const wrong = c.fields.filter((f) => !f.ok);
  const decided = new Map((s.fixes ?? []).filter((f) => f.to).map((f) => [`${f.field}|${f.from}|${f.to}`, f.decision]));
  const from = [...new Set(c.trace.filter((t) => t.status === 'match').map((t) => REG[t.registry]))].join(' and ') || 'the registry';
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setSaid('');
    try {
      await fn();
      setSaid(done);
    } catch (e) {
      setSaid(e instanceof Error ? e.message : 'That did not work.');
    }
    setBusy(false);
  };
  if (c.verdict === 'wrong-paper') {
    const r = c.record;
    return (
      <section className={css.panel} aria-label="Side-by-side comparison" data-kind="mismatch">
        <h3>Mismatch: this DOI belongs to another paper</h3>
        <div className={css.sides}>
          <div>
            <h4>You submitted</h4>
            <dl>
              <dt>Title</dt><dd>{s.raw.title ?? '–'}</dd>
              <dt>Authors</dt><dd>{s.raw.authors?.join(', ') || '–'}</dd>
              <dt>Year</dt><dd>{s.raw.year ?? '–'}</dd>
              <dt>Journal</dt><dd>{s.raw.container ?? '–'}</dd>
              <dt>DOI</dt><dd>{s.raw.doi ?? '–'}</dd>
            </dl>
          </div>
          <div>
            <h4>The DOI actually opens ({from})</h4>
            <dl>
              <dt>Title</dt><dd>{r?.title ?? '–'}</dd>
              <dt>Authors</dt><dd>{r?.authors.map((a) => a.family).join(', ') || 'none listed'}</dd>
              <dt>Year</dt><dd>{r?.year ?? '–'}</dd>
              <dt>Journal</dt><dd>{r?.container ?? '–'}</dd>
              <dt>DOI</dt><dd>{r?.doi ?? '–'}</dd>
            </dl>
          </div>
        </div>
        <p className="soft">Fields that differ: {wrong.map((f) => FIELD[f.field]).join(', ') || 'see above'}. A DOI that opens is not proof the reference is right. Find the paper you meant, or remove this one.</p>
      </section>
    );
  }
  return (
    <section className={css.panel} aria-label="Suggested fixes" data-kind="fix">
      <h3>Suggested fixes. You decide each one.</h3>
      <table className={css.fix}>
        <thead>
          <tr><th scope="col">Field</th><th scope="col">You wrote</th><th scope="col">Suggested</th><th scope="col">Evidence and rationale</th><th scope="col">Your decision</th></tr>
        </thead>
        <tbody>
          {wrong.map((f) => {
            const d = decided.get(`${f.field}|${f.given}|${f.registry}`);
            const can = !!suggested(f.field, c);
            return (
              <tr key={f.field}>
                <th scope="row">{FIELD[f.field]}</th>
                <td>{f.given}</td>
                <td>{f.registry}</td>
                <td className="soft">
                  From {from}. {f.field === 'year' ? `Years differ by ${Math.abs(Number(f.given) - Number(f.registry)) || '?'}; house rules allow ${POLICY.thresholds.yearTolerance}.` : `Match score ${Math.round(f.score * 100)}%, needs ${f.field === 'title' ? Math.round(POLICY.thresholds.titleMatch * 100) : 100}%.`}
                </td>
                <td>
                  {d ? (
                    <strong>{d === 'accepted' ? 'Fix accepted' : 'Fix rejected, still flagged'}</strong>
                  ) : can ? (
                    <span className="row">
                      <button className="btn main" type="button" disabled={busy} onClick={() => void run(() => acceptFix(s.id, f.field).then((r) => setSaid(`Fix accepted. Checked again: ${r.status}.`)), '')}>
                        Accept fix
                      </button>
                      <button className="btn" type="button" disabled={busy} onClick={() => void run(() => rejectFix(s.id, f.field), 'Fix rejected. Your value stays and the reference stays flagged.')}>
                        Reject fix
                      </button>
                    </span>
                  ) : (
                    <span className="soft">No registry value to offer</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {s.original && JSON.stringify(s.original) !== JSON.stringify(s.raw) && <p className="soft">Your original submission is kept: “{s.original.raw}”</p>}
      {said && <p role="status">{said}</p>}
    </section>
  );
}

/** Case 4. A retracted work is used only after a written acknowledgement, and it stays RETRACTED everywhere. */
export function RetractionAck({ s }: { s: Source }) {
  const id = useId();
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  if (s.check?.verdict !== 'retracted') return null;
  const r = s.check.record;
  const n = r?.notices?.find((x) => x.kind === 'retraction');
  return (
    <section className={css.panel} data-kind="retracted" aria-label="Retraction warning">
      <h3>RETRACTED. Do not cite this as ordinary evidence.</h3>
      <p>
        {r?.title} ({r?.year ?? 'n.d.'}). {r?.container}. Retracted{r?.retractedOn ? ` on ${r.retractedOn}` : n?.on ? ` on ${n.on}` : ''}
        {n?.reasons?.length ? `. Reasons recorded by Retraction Watch: ${n.reasons.join('; ')}` : '. No reason is recorded in the data we hold'}.
        {n?.doi && (
          <> <a href={`https://doi.org/${n.doi}`} target="_blank" rel="noreferrer">Read the retraction notice</a></>
        )}
      </p>
      {s.retractionAcknowledged ? (
        <p>
          <strong>You acknowledged the retraction</strong> on {new Date(s.retractionAcknowledged.at).toLocaleDateString('en-GB')}: “{s.retractionAcknowledged.text}”. The warning stays in your library, citations and exports.
        </p>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            setErr('');
            void acknowledgeRetraction(s.id, text).catch((x) => setErr(x instanceof Error ? x.message : 'That did not work.'));
          }}
        >
          <label htmlFor={`${id}-ack`}>
            <strong>Acknowledge the retraction</strong> <span className="soft">Say why you need it, for example to discuss the retraction itself.</span>
          </label>
          <textarea id={`${id}-ack`} className="field" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn" type="submit">I acknowledge this work is retracted</button>
          {err && <p role="alert">{err}</p>}
        </form>
      )}
    </section>
  );
}

/** Every decision on this reference, from the hash-chained log. */
export function History({ s }: { s: Source }) {
  const rows = useLiveQuery(() => decisionsFor(s), [s.id, s.check?.checkedAt, s.fixes?.length, s.notes, s.retractionAcknowledged?.at]) ?? [];
  const added = useLiveQuery(() => db.log.where('projectId').equals(s.projectId).filter((e) => e.action === 'source.added' && e.detail.startsWith((s.record?.title ?? s.raw?.raw ?? '').slice(0, 40))).first(), [s.id]);
  if (!rows.length && !added) return null;
  return (
    <details className={css.history}>
      <summary>Decision history ({rows.length})</summary>
      <ol>
        {rows.map((r, i) => (
          <li key={i}>
            <span className="mono">{new Date(r.at).toLocaleString('en-GB')}</span> {r.action.replace(/-/g, ' ')} by {r.by}. Before: {r.before}. After: {r.after}. <span className="soft">Evidence: {r.evidence}</span>
          </li>
        ))}
        {added && <li><span className="mono">{new Date(added.at).toLocaleString('en-GB')}</span> added to the library by the checker: {added.detail}</li>}
      </ol>
    </details>
  );
}
