import { REASON_TEXT, VERDICT_TEXT, type RawReference, type ReferenceCheck, type RegistryTrace } from '@/core/contracts';
import { cleanTitle } from '@/core/verify/normalise';
import css from './Receipt.module.css';
import { VerdictStamp } from './Stamp';

const REGISTRY: Record<RegistryTrace['registry'], string> = { crossref: 'Crossref', openalex: 'OpenAlex', datacite: 'DataCite', 'doi.org': 'doi.org' };
const STATUS: Record<RegistryTrace['status'], string> = { match: 'has it', 'no-match': 'no match', 'not-found': 'no record', error: 'did not answer', skipped: 'not asked' };
const FIELD = { title: 'Title', authors: 'Authors', year: 'Year', doi: 'DOI' } as const;

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
      <p className={css.strip} aria-hidden="true">
        {strip(check)}
      </p>
      {children && <div className={css.actions}>{children}</div>}
    </article>
  );
}
