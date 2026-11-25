import { useEffect, useMemo, useRef, useState } from 'react';
import { citeKey } from '@/core/cite/csl';
import type { Project, ReferenceCheck, RegistryRecord, Source } from '@/core/contracts';
import { alreadyHave } from '@/core/library/duplicates';
import { registries, worksById } from '@/core/registries';
import { cleanTitle } from '@/core/verify/normalise';
import { checkReference } from '@/core/verify/verdict';
import { record as log } from '@/log/log';
import { sharedMissing } from '@/map/missing';
import { policyIssues } from '@/policy/apply';
import { addSource, skipSource } from '@/store/actions';
import { VerdictStamp } from '@/ui/Stamp';
import css from './Map.module.css';

interface Row { id: string; record: RegistryRecord; by: Source[]; check?: ReferenceCheck; done?: 'kept' | 'skipped' }

const who = (s: Source): string => {
  const k = citeKey(s);
  return `${k.family || 'No author'}${k.all.length > 1 ? ' et al.' : ''} ${k.year ?? 'n.d.'}`;
};

/** Works that two or more of the student's sources cite and the library does not have. Each one goes through the Checker. */
export function MissingPapers({ project, sources }: { project: Project; sources: Source[] }) {
  const found = useMemo(() => sharedMissing(sources), [sources]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = useRef(0);
  useEffect(() => () => { run.current++; }, []);

  async function look() {
    const mine = ++run.current;
    setBusy(true);
    setError('');
    setRows(null);
    try {
      const recs = await worksById(found.list.map((m) => m.id));
      if (run.current !== mine) return;
      const byId = new Map(recs.map((r) => [r.openalexId ?? r.id, r]));
      const all = found.list.map((m) => ({ id: m.id, record: byId.get(m.id), by: m.by })).filter((m): m is Row => !!m.record);
      const list = all.filter((m) => !m.record.retracted && !alreadyHave(m.record, sources));
      setLeft(all.filter((m) => m.record.retracted).length);
      setRows(list);
      void log(project.id, 'code', 'missing.looked', `${list.length} works cited by two or more sources and not in the library`);
      // Three at a time, so one slow answer does not hold up the rest.
      let next = 0;
      const worker = async () => {
        while (next < list.length && run.current === mine) {
          const m = list[next++]!;
          const t = cleanTitle(m.record.title);
          const check = await checkReference({ raw: t, title: t, authors: m.record.authors.slice(0, 6).map((x) => x.family), ...(m.record.year ? { year: m.record.year } : {}), ...(m.record.doi ? { doi: m.record.doi } : {}) }, registries);
          if (run.current !== mine) return;
          setRows((cur) => cur?.map((x) => (x.id === m.id ? { ...x, check: check.record ? { ...check, record: { ...check.record, abstract: check.record.abstract ?? m.record.abstract } as RegistryRecord } : check } : x)) ?? null);
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    } catch {
      if (run.current === mine) setError('A registry did not answer. Try again in a minute.');
    }
    if (run.current === mine) setBusy(false);
  }

  async function keep(m: Row) {
    if (!m.check) return;
    await addSource(project.id, 'search', { record: m.record, check: m.check, approve: m.check.verdict === 'confirmed' && !policyIssues(m.check.record ?? m.record).length });
    setRows((cur) => cur?.map((x) => (x.id === m.id ? { ...x, done: 'kept' } : x)) ?? null);
  }
  function skip(m: Row) {
    setRows((cur) => cur?.map((x) => (x.id === m.id ? { ...x, done: 'skipped' } : x)) ?? null);
    void skipSource(project.id, m.record.title);
  }

  return (
    <section className="stack" aria-label="Papers you may be missing">
      <h2>Papers you may be missing</h2>
      <p className="soft">Works that two or more of your sources cite and you do not have. Often cited does not mean right, and it favours older work.</p>
      {found.withList < 2 ? (
        <p>
          This needs at least two sources with a reference list in OpenAlex. You have {found.withList}.
        </p>
      ) : found.list.length === 0 ? (
        <p>Your {found.withList} sources with a reference list do not share any work that you are missing.</p>
      ) : (
        <div className="row">
          <button className="btn" type="button" disabled={busy} onClick={() => void look()}>
            {busy ? 'Looking…' : rows ? 'Look again' : 'Show them'}
          </button>
          <span className="soft">
            Counted from {found.withList} reference lists.{found.without > 0 ? ` ${found.without} ${found.without === 1 ? 'source has' : 'sources have'} none.` : ''}
          </span>
        </div>
      )}
      {error && (
        <p role="alert" className={css.error}>
          {error}
        </p>
      )}
      {rows && rows.length === 0 && <p role="status">Nothing to show. What your sources share is already in your library{left ? ', or is retracted' : ''}.</p>}
      {rows && rows.length > 0 && (
        <ul className={css.missing}>
          {rows.map((m) => (
            <li key={m.id} className="card" data-done={m.done}>
              <div className="stack">
                <strong>{cleanTitle(m.record.title)}</strong>
                <span className="soft">
                  {m.record.authors.slice(0, 3).map((a) => a.family).join(', ') || 'No authors listed'}
                  {m.record.authors.length > 3 ? ' et al.' : ''} · {m.record.year ?? 'year not stated'}
                  {m.record.container ? ` · ${m.record.container}` : ''}
                </span>
                <span>
                  Cited by {m.by.length} of your sources: {[...m.by].sort((a, b) => (citeKey(a).year ?? 0) - (citeKey(b).year ?? 0) || who(a).localeCompare(who(b))).map(who).join('; ')}
                </span>
                <div className="row">{m.check ? <VerdictStamp verdict={m.check.verdict} /> : <span className="soft">Checking…</span>}</div>
                {policyIssues(m.check?.record).map((x) => (
                  <span key={x} className={css.flag}>
                    {x}
                  </span>
                ))}
              </div>
              <div className="row">
                {m.done === 'kept' ? (
                  <strong>In your library</strong>
                ) : m.done === 'skipped' ? (
                  <span className="soft">Skipped</span>
                ) : (
                  <>
                    <button className="btn main" type="button" disabled={!m.check} onClick={() => void keep(m)}>
                      Keep
                    </button>
                    <button className="btn" type="button" onClick={() => skip(m)}>
                      Skip
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {rows && left > 0 && <p className="soft">{left === 1 ? '1 was left out because it is retracted.' : `${left} were left out because they are retracted.`}</p>}
    </section>
  );
}
