import { REASON_TEXT, VERDICT_TEXT, type RawReference, type ReferenceCheck, type RegistryTrace } from '@/core/contracts';
import { retractionRisk } from '@/core/risk/risk';
import { cleanTitle } from '@/core/verify/normalise';
import { apaWeb, webParts } from '@/core/verify/web';
import css from './Receipt.module.css';
import { VerdictStamp } from './Stamp';

const REGISTRY: Record<RegistryTrace['registry'], string> = { crossref: 'Crossref', openalex: 'OpenAlex', datacite: 'DataCite', 'doi.org': 'doi.org', 'retraction-watch': 'Retraction Watch' };
const STATUS: Record<RegistryTrace['status'], string> = { match: 'has it', 'no-match': 'no match', 'not-found': 'no record', error: 'did not answer', skipped: 'not asked' };
const FIELD = { title: 'Title', authors: 'Authors', year: 'Year', doi: 'DOI', container: 'Journal', volume: 'Volume', issue: 'Issue', pages: 'Pages' } as const;

/** The strip at the foot of a receipt, in the style of a passport's machine-readable line. */
export function strip(c: ReferenceCheck): string {
  const up = (s: string) => s.toUpperCase().normalize('NFKD').replace(/[^A-Z0-9./-]+/g, '<');
  if (!c.record) return 'REF<<<<<<<<<<<< NO RECORD <<<<<<<<<<<<';
  const r = c.record;
  const names = r.authors.slice(0, 4).map((a) => up(a.family)).join('<');
  return `REF<<${names}<<${r.year ?? ''}<<${r.doi ? up(r.doi) : up(r.id)}<<${c.verdict === 'confirmed' ? '' : `${up(c.verdict)}<<`}`;
}

export function Receipt({ check, raw, children, live }: { check: ReferenceCheck; raw?: RawReference; children?: React.ReactNode; live?: boolean }) {
  const t = VERDICT_TEXT[check.verdict];
  const r = check.record;
  const asked = [...new Map(check.trace.map((x) => [x.registry, x])).values()];
  // A caution only. It never changes the verdict above and is not shown for a work already retracted.
  const risk = r && !r.retracted ? retractionRisk(r) : null;
  return (
    <article className={`${css.receipt}${live ? ` ${css.feed}` : ''}`} data-verdict={check.verdict}>
      <header className={css.head}>
        <VerdictStamp verdict={check.verdict} land />
        {check.sample && <span className="sample">SAMPLE</span>}
      </header>
      <p className={css.plain}>{t.plain}</p>
      {check.reasons.length > 0 && (
        <ul className={css.reasons}>
          {check.reasons.map((x) => (
            <li key={x}>{REASON_TEXT[x]}</li>
          ))}
        </ul>
      )}
      {check.fields.length > 0 && (
        <table className={css.diff}>
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">You have</th>
              <th scope="col">Registry has</th>
            </tr>
          </thead>
          <tbody>
            {check.fields.map((f) => (
              <tr key={f.field} data-ok={f.ok}>
                <th scope="row">
                  <span aria-hidden="true">{f.ok ? '✓' : '≠'}</span> {FIELD[f.field]}
                  <span className="sr">{f.ok ? ' matches' : ' does not match'}</span>
                </th>
                <td>{f.given}</td>
                <td>{f.registry}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {r && check.fields.length === 0 && (
        <dl className={css.facts}>
          <dt>Title</dt>
          <dd>{cleanTitle(r.title)}</dd>
          <dt>Authors</dt>
          <dd>{r.authors.map((a) => a.family).join(', ') || 'none listed'}</dd>
          <dt>Year</dt>
          <dd>{r.year ?? 'not stated'}</dd>
        </dl>
      )}
      {r?.retracted && (
        <p className={css.retract}>
          Retracted{r.retractedOn ? ` on ${r.retractedOn}` : ''}.{r.citedBy ? ` OpenAlex counts ${r.citedBy} citations to it.` : ''}
        </p>
      )}
      {!!r?.notices?.length && (
        <ul className={css.notices} aria-label="Published about this work later">
          {r.notices.map((x) => (
            <li key={`${x.kind}${x.doi ?? x.on ?? ''}`} data-kind={x.kind}>
              <strong>{x.label}</strong>
              {x.on ? `, ${x.on}` : ''}
              {x.by === 'retraction-watch' ? ', from Retraction Watch' : ', from the publisher'}
              {!!x.reasons?.length && `. Reasons recorded by Retraction Watch: ${x.reasons.join('; ')}`}
              {x.doi && (
                <>
                  {'. '}
                  <a href={`https://doi.org/${x.doi}`} target="_blank" rel="noreferrer">
                    Read the notice
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {risk && risk.band !== 'typical' && (
        <p className={css.risk}>
          Retraction risk signal: higher than {risk.band === 'much-higher' ? '97' : '90'}% of ordinary papers in our test{risk.because.length ? `, mostly because of ${risk.because.join(', ')}` : ''}. This is a trained model, not a check: read the paper carefully, it may be perfectly sound. <a href="#/data">How the model works</a>
        </p>
      )}
      <p className={css.asked}>
        {asked.map((x, i) => (
          <span key={x.registry}>
            {i > 0 && ' · '}
            {REGISTRY[x.registry]} {STATUS[x.status]}
          </span>
        ))}
        {r?.doi && (
          <>
            {' · '}
            <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noreferrer">
              Open the source
            </a>
          </>
        )}
      </p>
      {raw && !check.fields.length && raw.raw.length < 160 && <p className={css.asked}>Checked: {raw.raw}</p>}
      {check.verdict === 'web-source' && raw && (() => {
        const w = webParts(raw);
        if (!w) return null;
        const a = apaWeb(w);
        return (
          <p className={css.plain} data-apa-web>
            Web source, APA 7: {a.before}<i>{a.title}</i>{a.after}
            <br />
            <span className="soft">{w.author ? 'The organisation stands as author.' : 'No author is given, so the title comes first.'} {w.year ? '' : 'No date is given, so it is n.d.'} Scholarly databases were searched and hold no record; database verification does not apply to web pages.</span>
          </p>
        );
      })()}
      <p className={css.strip} aria-hidden="true">
        {strip(check)}
      </p>
      {children && <div className={css.actions}>{children}</div>}
    </article>
  );
}
