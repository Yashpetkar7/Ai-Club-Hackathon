import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { go, Link } from '@/app/router';
import { VERDICT_TEXT, type RawReference, type ReferenceCheck, type Verdict } from '@/core/contracts';
import { registries } from '@/core/registries';
import { extractReferences } from '@/core/verify/parse';
import { duplicateGroups, registryFix } from '@/core/verify/fix';
import { checkReference } from '@/core/verify/verdict';
import { SAMPLE_NOTE, SAMPLE_TEXT } from '@/fixtures/sample';
import { addSource } from '@/store/actions';
import { db } from '@/store/db';
import { Receipt } from '@/ui/Receipt';
import { Legend } from '@/ui/Legend';
import { NotVerified, Stamp, VerdictStamp } from '@/ui/Stamp';
import css from './Check.module.css';
import { SeeAlso } from './Signposts';

interface Item {
  id: number;
  ref: RawReference;
  check?: ReferenceCheck;
  saved?: boolean;
  /** The student's answer to a suggested fix. Nothing changes without it. */
  fix?: 'accepted' | 'rejected';
}

const FIELD_WORD = { title: 'Title', authors: 'Authors', year: 'Year', doi: 'DOI' } as const;

/** One paste checks at most this many. The rest are never dropped silently: the page says how many were left out. */
const MAX_REFS = 60;
const ORDER: Verdict[] = ['confirmed', 'one-registry', 'details-differ', 'wrong-paper', 'retracted', 'not-found', 'could-not-check'];
export const HANDOFF = 'pt-check-text';

export function Check() {
  const [text, setText] = useState('');
  const [items, setItems] = useState<Item[] | null>(null);
  const [leftOut, setLeftOut] = useState(0);
  const [orphans, setOrphans] = useState<string[]>([]);
  const [given, setGiven] = useState('');
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [projectId, setProjectId] = useState('');
  const run = useRef(0);
  const handed = useRef<string | null>(null);
  const projects = useLiveQuery(() => db.projects.orderBy('createdAt').reverse().toArray(), []) ?? [];

  useEffect(() => {
    // Kept in a ref because React mounts effects twice in development.
    try {
      handed.current ??= sessionStorage.getItem(HANDOFF);
      sessionStorage.removeItem(HANDOFF);
    } catch {
      /* storage is blocked: start empty */
    }
    if (handed.current) {
      setText(handed.current);
      void start(handed.current);
    }
    return () => {
      run.current++;
    };
  }, []);

  async function start(input: string) {
    const mine = ++run.current;
    const x = extractReferences(input);
    const list: Item[] = x.references.slice(0, MAX_REFS).map((ref, id) => ({ id, ref }));
    setLeftOut(Math.max(0, x.references.length - MAX_REFS));
    setOrphans(x.orphanCitations);
    setGiven(input.trim());
    setItems(list);
    setOpen(null);
    if (!list.length) return;
    setRunning(true);
    let next = 0;
    const worker = async () => {
      while (next < list.length && run.current === mine) {
        const it = list[next++]!;
        const check = await checkReference(it.ref, registries);
        if (run.current !== mine) return;
        setItems((cur) => cur?.map((c) => (c.id === it.id ? { ...c, check } : c)) ?? cur);
        setOpen((cur) => cur ?? (check.verdict !== 'confirmed' ? it.id : null));
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (run.current === mine) {
      setRunning(false);
      setOpen((cur) => cur ?? list[0]?.id ?? null);
    }
  }

  async function again(it: Item) {
    const mine = run.current;
    setItems((cur) => cur?.map((c) => (c.id === it.id ? { id: c.id, ref: c.ref } : c)) ?? cur);
    const check = await checkReference(it.ref, registries);
    if (run.current === mine) setItems((cur) => cur?.map((c) => (c.id === it.id ? { ...c, check } : c)) ?? cur);
  }

  /** The student accepts the registry's details. The reference is checked again, so the label still comes from the checker. */
  async function acceptFix(it: Item) {
    const f = registryFix(it.ref, it.check);
    if (!f) return;
    const mine = run.current;
    setItems((cur) => cur?.map((c) => (c.id === it.id ? { id: c.id, ref: f.ref, fix: 'accepted' as const } : c)) ?? cur);
    const check = await checkReference(f.ref, registries);
    if (run.current === mine) setItems((cur) => cur?.map((c) => (c.id === it.id ? { ...c, check } : c)) ?? cur);
  }
  const rejectFix = (it: Item) => setItems((cur) => cur?.map((c) => (c.id === it.id ? { ...c, fix: 'rejected' as const } : c)) ?? cur);
  /** Merging duplicates: the student picks the entry to keep and the others leave this list. */
  const keepOnly = (keep: number, drop: number[]) => {
    setItems((cur) => cur?.filter((c) => !drop.includes(c.id)) ?? cur);
    setOpen(keep);
  };
  const [different, setDifferent] = useState<string[]>([]);

  async function save(it: Item) {
    const pid = projectId || projects[0]?.id;
    if (!pid || !it.check) return;
    await addSource(pid, 'check', { raw: it.ref, check: it.check });
    setItems((cur) => cur?.map((c) => (c.id === it.id ? { ...c, saved: true } : c)) ?? cur);
  }

  const done = items?.filter((i) => i.check) ?? [];
  const counts = ORDER.map((v) => [v, done.filter((i) => i.check!.verdict === v).length] as const).filter(([, n]) => n > 0);
  const current = items?.find((i) => i.id === open);
  const fix = current ? registryFix(current.ref, current.check) : null;
  const groups = items && !running ? duplicateGroups(done).filter((g) => !different.includes(g.ids.join())) : [];
  const pos = (id: number) => (items?.findIndex((i) => i.id === id) ?? -1) + 1;
  const short = (id: number) => {
    const it = items?.find((i) => i.id === id);
    return (it?.ref.title ?? it?.ref.raw ?? '').slice(0, 60);
  };

  return (
    <main className="wrap page" id="main" tabIndex={-1}>
      <div className="stack">
        <h1>Check references</h1>
        <p className="soft">Paste a paragraph, a reference list or a DOI. We look each one up in Crossref and OpenAlex and tell you which are real. No AI takes part.</p>
        <SeeAlso from="check" />
      </div>

      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void start(text);
        }}
      >
        <label className="sr" htmlFor="check-text">
          Text to check
        </label>
        <textarea
          id="check-text"
          className={`field ${css.area}`}
          value={text}
          placeholder="Paste here"
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            setIsSample(false);
          }}
        />
        <div className="row">
          <button className="btn main" type="submit" disabled={!text.trim()}>
            {running ? 'Check again' : 'Check'}
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              setText(SAMPLE_TEXT);
              setIsSample(true);
              void start(SAMPLE_TEXT);
            }}
          >
            Try a sample
          </button>
          {isSample && (
            <span className="soft">
              <span className="sample">SAMPLE</span> {SAMPLE_NOTE}
            </span>
          )}
        </div>
      </form>

      {items === null && (
        <section className={css.empty} aria-label="What the labels mean">
          {ORDER.map((v) => (
            <div key={v}>
              <VerdictStamp verdict={v} />
              <p className="soft">{VERDICT_TEXT[v].plain}</p>
            </div>
          ))}
        </section>
      )}

      {items?.length === 0 && (
        <section className={`card ${css.note}`} role="status">
          <div className="row">
            <NotVerified />
            <strong className={css.given}>{given.length > 160 ? `${given.slice(0, 160)}…` : given}</strong>
          </div>
          <h2>This could not be verified</h2>
          <p className="soft">A name or a few words is not enough to look up, so nothing here counts as real. Give a full title, a DOI or the whole reference.</p>
          {orphans.length > 0 && <p>These citations have no reference to check: {orphans.join('; ')}.</p>}
        </section>
      )}

      {items && items.length > 0 && (
        <section className="stack" aria-label="Results">
          <div className={css.tally} role="status" aria-live="polite">
            <strong>
              {running ? `Checked ${done.length} of ${items.length}` : `${items.length} ${items.length === 1 ? 'reference' : 'references'} checked`}
            </strong>
            {counts.map(([v, n]) => (
              <Stamp key={v} tone={VERDICT_TEXT[v].tone} mark={VERDICT_TEXT[v].mark}>
                {n} {VERDICT_TEXT[v].label.toLowerCase()}
              </Stamp>
            ))}
          </div>
          {orphans.length > 0 && (
            <p className={css.orphans}>
              <NotVerified /> Cited in the text with no entry in the list: <strong>{orphans.join('; ')}</strong>
            </p>
          )}
          {leftOut > 0 && (
            <p className={css.orphans} role="status">
              Only the first {MAX_REFS} references were checked. {leftOut} more {leftOut === 1 ? 'was' : 'were'} not checked: paste {leftOut === 1 ? 'it' : 'them'} in a second batch.
            </p>
          )}
          {groups.map((g) => (
            <div key={g.ids.join()} className={css.fix} role="group" aria-label="The same work, listed more than once">
              <p>
                <strong>Duplicate.</strong> {g.ids.map((id) => `#${pos(id)} “${short(id)}”`).join(' and ')} are the same work. {g.why} Keep one entry?
              </p>
              <div className="row">
                {g.ids.map((id) => (
                  <button key={id} className="btn" type="button" onClick={() => keepOnly(id, g.ids.filter((x) => x !== id))}>
                    Keep #{pos(id)} and merge
                  </button>
                ))}
                <button className="btn" type="button" onClick={() => setDifferent((d) => [...d, g.ids.join()])}>
                  They are different works
                </button>
              </div>
            </div>
          ))}
          <div className={css.split}>
            <ol className={css.list}>
              {items.map((it) => (
                <li key={it.id}>
                  <button type="button" className={css.item} aria-pressed={open === it.id} onClick={() => setOpen(it.id)}>
                    <span className={css.ref}>{it.ref.title ?? it.ref.raw}</span>
                    <span className={css.sub}>{[it.ref.authors?.join(', '), it.ref.year, it.ref.doi].filter(Boolean).join(' · ') || 'No author, year or DOI given'}</span>
                    {it.check ? <VerdictStamp verdict={it.check.verdict} land /> : <span className={css.wait}>Checking…</span>}
                  </button>
                </li>
              ))}
            </ol>
            <div className={css.side}>
              {current?.check ? (
                <Receipt key={current.id} check={current.check} raw={current.ref} live>
                  {current.check.verdict === 'wrong-paper' && current.check.record && (
                    <div className={css.fix} role="group" aria-label="What this DOI points to">
                      <p>
                        <strong>You pasted:</strong> {current.ref.raw}
                      </p>
                      <p>
                        <strong>This DOI points to:</strong>{' '}
                        {[current.check.record.authors.slice(0, 3).map((a) => a.family).join(', ') + (current.check.record.authors.length > 3 ? ` and ${current.check.record.authors.length - 3} more` : ''), current.check.record.year && `(${current.check.record.year})`, current.check.record.title, current.check.record.doi].filter(Boolean).join(' · ')}
                      </p>
                      <p className="soft">Nothing was swapped. Find the right DOI for the paper you meant, or leave this reference out.</p>
                    </div>
                  )}
                  {fix && current.fix !== 'rejected' && (
                    <div className={css.fix} role="group" aria-label="Suggested fix">
                      <p>
                        <strong>Suggested fix, from the registry.</strong> Nothing changes unless you accept it.
                      </p>
                      <ul className={css.changes}>
                        {fix.changes.map((c) => (
                          <li key={c.field}>
                            {FIELD_WORD[c.field]}: you wrote <strong>{c.from || 'nothing'}</strong>, the registry has <strong>{c.to}</strong>
                          </li>
                        ))}
                      </ul>
                      <div className="row">
                        <button className="btn main" type="button" onClick={() => void acceptFix(current)}>
                          Accept the fix
                        </button>
                        <button className="btn" type="button" onClick={() => rejectFix(current)}>
                          Keep mine
                        </button>
                      </div>
                    </div>
                  )}
                  {current.fix === 'rejected' && <p className="soft">You kept your details. The label stays “{VERDICT_TEXT['details-differ'].label}” until they match the registry.</p>}
                  {current.fix === 'accepted' && <p className="soft">You accepted the registry’s details, and the reference was checked again.</p>}
                  {(current.check.verdict === 'one-registry' || current.check.verdict === 'could-not-check') && (
                    <button className="btn main" type="button" onClick={() => void again(current)}>
                      Check again
                    </button>
                  )}
                  {projects.length > 0 ? (
                    <>
                      <button className="btn" type="button" disabled={current.saved} onClick={() => void save(current)}>
                        {current.saved ? 'Saved to project' : 'Save to project'}
                      </button>
                      <label className="sr" htmlFor="save-project">
                        Project
                      </label>
                      <select id="save-project" className={css.pick} value={projectId || projects[0]!.id} onChange={(e) => setProjectId(e.target.value)}>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.question.slice(0, 60)}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <button className="btn" type="button" onClick={() => go('/projects')}>
                      Start a project to save this
                    </button>
                  )}
                </Receipt>
              ) : (
                <p className="soft">{running ? 'Asking the registries…' : 'Select a reference to see its receipt.'}</p>
              )}
            </div>
          </div>
        </section>
      )}
      {items !== null && <Legend />}
      <p className="soft">
        “Not found” does not mean fake. <Link to="/rules">See what we can and cannot check</Link>.
      </p>
    </main>
  );
}
