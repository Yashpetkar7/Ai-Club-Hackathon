import { useDeferredValue, useMemo, useRef, useState, type RefObject } from 'react';
import { Link } from '@/app/router';
import { titleOf } from '@/core/cite/preflight';
import { findCitations, sourceFor } from '@/core/cite/draft';
import type { Project, Source } from '@/core/contracts';
import { checkCopied, citationsFor, copyText, type CopyItem } from '@/core/draftcheck/copied';
import { applyEdits, checkLanguage, type Edit, type Slip } from '@/core/draftcheck/language';
import { locatorOf, pageText } from '@/core/pdf/pages';
import { record as log } from '@/log/log';
import { POLICY } from '@/policy/policy';
import { citable } from '@/store/actions';
import { Stamp } from '@/ui/Stamp';
import css from './DraftCheck.module.css';

const SHOWN = 25;

interface Props {
  project: Project;
  text: string;
  sources: Source[];
  /** The citation for a source, with a page when one is given. Null while the style is loading. */
  cite: (s: Source, page: string) => string | null;
  onChange: (v: string) => void;
  area: RefObject<HTMLTextAreaElement | null>;
}

/** Copied text, quotations, repetition and slips. Rules only: no AI, nothing leaves the device, nothing changes without a click. */
export function DraftCheck({ project, text, sources, cite, onChange, area }: Props) {
  const [on, setOn] = useState(false);
  const [at, setAt] = useState('');
  const result = useRef<HTMLParagraphElement>(null);
  const [left, setLeft] = useState<Set<string>>(new Set());
  const [all, setAll] = useState(false);
  const [said, setSaid] = useState('');
  const [last, setLast] = useState<{ before: string; after: string } | null>(null);
  const later = useDeferredValue(text);
  const stale = later !== text;
  const copied = useMemo(() => (on && POLICY.draftCheck.copied ? checkCopied(later, sources, project.style) : null), [on, later, sources, project.style]);
  const slips = useMemo(() => (on && POLICY.draftCheck.language ? checkLanguage(later) : []), [on, later]);
  if (!POLICY.draftCheck.copied && !POLICY.draftCheck.language) return null;

  const keyOf = (x: { text: string; rule?: string; kind?: string }) => `${x.rule ?? x.kind}|${x.text}`;
  const items = (copied?.items ?? []).filter((x) => !left.has(keyOf(x)));
  const repeat = slips.filter((x) => x.group === 'repeat' && !left.has(keyOf(x)));
  const language = slips.filter((x) => x.group === 'language' && !left.has(keyOf(x)));

  function start() {
    setOn(true);
    setAt(new Date().toLocaleTimeString('en-GB'));
    // Takes the reader to the result, by eye and by screen reader.
    requestAnimationFrame(() => result.current?.focus());
    setSaid('');
    setLeft(new Set());
    const c = POLICY.draftCheck.copied ? checkCopied(text, sources, project.style) : null;
    const s = POLICY.draftCheck.language ? checkLanguage(text) : [];
    void log(project.id, 'code', 'draft.checked', `${c?.items.length ?? 0} about copied text or quotations, ${s.length} about wording, compared with ${c?.compared.length ?? 0} sources`);
  }

  function show(r: { start: number; end: number }) {
    const el = area.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(r.start, r.end);
    // Chrome does not scroll a text box to its selection.
    const line = el.value.length ? r.start / el.value.length : 0;
    el.scrollTop = Math.max(0, el.scrollHeight * line - el.clientHeight / 2);
    el.scrollIntoView?.({ block: 'center' });
  }

  function change(edits: Edit[], what: string) {
    if (stale) return;
    const after = applyEdits(text, edits);
    onChange(after);
    setLast({ before: text, after });
    setSaid('Changed.');
    void log(project.id, 'student', 'draft.fix', what.slice(0, 200));
  }

  function leave(x: { text: string; rule?: string; kind?: string }) {
    setLeft((s) => new Set(s).add(keyOf(x)));
    void log(project.id, 'student', 'draft.left', `${x.rule ?? x.kind}: ${x.text}`.slice(0, 200));
  }

  /** One mechanical step the student may take: quotation marks, a citation, or a page. Never new wording. */
  function step(i: CopyItem): { label: string; edits: Edit[] } | null {
    const s = i.source;
    const page = locatorOf(i.page ?? null);
    const bracket = s && citable(s) ? cite(s, page) : null;
    if (i.kind === 'copied') {
      const add = !i.cited && bracket ? ` ${bracket}` : '';
      return { label: add ? 'Add quotation marks and the citation' : 'Add quotation marks', edits: [{ start: i.start, end: i.start, text: '“' }, { start: i.end, end: i.end, text: `”${add}` }] };
    }
    if (i.kind === 'quote-no-citation' && bracket) return { label: 'Add the citation', edits: [{ start: i.end, end: i.end, text: ` ${bracket}` }] };
    if (i.kind === 'quote-no-page' && page && s) {
      const c = citationsFor(later, i, findCitations(later)).find((x) => sourceFor(x, [s]));
      if (!c) return null;
      const at = later[c.end - 1] === ')' ? c.end - 1 : c.end;
      const t = project.style === 'mla' ? ` ${page}` : project.style === 'chicago' ? `, ${page}` : `, ${/–/.test(page) ? 'pp.' : 'p.'} ${page}`;
      return { label: `Add page ${page}`, edits: [{ start: at, end: at, text: t }] };
    }
    return null;
  }

  const total = items.length + repeat.length + language.length;
  return (
    <section className={css.box} aria-label="Draft check">
      <div className={css.head}>
        <div className="stack">
          <h2>Draft check</h2>
          <p className="soft">Finds words that are too close to your sources, quotations that do not match, repetition and slips. Plain rules, no AI. Your draft stays on this device.</p>
        </div>
        <button className="btn main" type="button" disabled={!text.trim()} onClick={start}>
          {on ? 'Check again' : 'Check my draft'}
        </button>
      </div>
      {on && (
        <>
          {copied && (
            <p className={css.scope}>
              {copied.compared.length === 0 ? 'No source in your library has text yet, so nothing could be compared. Get abstracts in Evidence, or add PDFs in the library.' : `Compared with ${copied.compared.length} ${copied.compared.length === 1 ? 'source' : 'sources'} in your library.`}
              {copied.unreadable.length > 0 && ` ${copied.unreadable.length} ${copied.unreadable.length === 1 ? 'has' : 'have'} no text we can read.`} We cannot see the web, books or other people’s work, so this is not a plagiarism verdict.{at && <span className="soft"> Checked at {at}, and again as you type.</span>}
            </p>
          )}
          <p role="status" className={css.count} ref={result} tabIndex={-1}>
            {stale ? 'Reading your changes…' : total === 0 ? 'Nothing found. That is not the same as nothing there.' : `${items.length} about your sources, ${repeat.length} said more than once, ${language.length} about wording.`}
            {copied && copied.quotesOk > 0 && !stale ? ` ${copied.quotesOk} ${copied.quotesOk === 1 ? 'quotation matches its' : 'quotations match their'} source.` : ''} {last?.after === text ? said : ''}
          </p>
          {last?.after === text && (
            <button
              className={`btn ${css.undo}`}
              type="button"
              onClick={() => {
                onChange(last.before);
                setLast(null);
                void log(project.id, 'student', 'draft.undo', 'Last correction undone');
              }}
            >
              Undo that change
            </button>
          )}
          {items.length > 0 && (
            <div className="stack">
              <h3>Your words and your sources</h3>
              <ul className={css.list}>
                {items.slice(0, all ? undefined : SHOWN).map((i) => {
                  const t = copyText(i);
                  const next = step(i);
                  return (
                    <li key={`${i.kind}${i.start}`} className="card" data-level={i.level}>
                      <div className="row">
                        <Stamp tone={i.level === 'fix' ? 'bad' : 'warn'} mark={i.level === 'fix' ? '!' : '?'}>
                          {i.level === 'fix' ? 'Fix' : 'Look'}
                        </Stamp>
                        <strong>{t.title}</strong>
                      </div>
                      <p className="soft">{t.why}</p>
                      <div className={css.pair}>
                        <div>
                          <span className="soft">Your draft</span>
                          <blockquote>{i.text}</blockquote>
                        </div>
                        {i.passage && i.source && (
                          <div>
                            <span className="soft">
                              {titleOf(i.source)}
                              {i.page ? ` · ${pageText(i.page)}` : i.source.textOrigin === 'abstract' ? ' · abstract' : ''}
                            </span>
                            <blockquote>{i.passage}</blockquote>
                          </div>
                        )}
                      </div>
                      <div className="row">
                        {next && (
                          <button className="btn" type="button" disabled={stale} onClick={() => change(next.edits, `${i.kind}: ${i.text}`)}>
                            {next.label}
                          </button>
                        )}
                        <button className="btn quiet" type="button" disabled={stale} onClick={() => show(i)}>
                          Show in the draft
                        </button>
                        <button className="btn quiet" type="button" onClick={() => leave(i)}>
                          Leave it
                        </button>
                        {i.kind === 'quote-not-seen' && <Link to={`/p/${project.id}/library`}>Add the PDF in the library</Link>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <Slips title="Said more than once" list={repeat} stale={stale} all={all} onShow={show} onChange={change} onLeave={leave} />
          <Slips title="Wording" list={language} stale={stale} all={all} onShow={show} onChange={change} onLeave={leave} note="It corrects slips and never rewrites a sentence. Quotations and citations are left alone." />
          {!all && [items, repeat, language].some((l) => l.length > SHOWN) && (
            <button className="btn" type="button" onClick={() => setAll(true)}>
              Show all {total}
            </button>
          )}
        </>
      )}
    </section>
  );
}

const fixLabel = (s: Slip): string => {
  if (s.rule === 'Word typed twice') return 'Remove one';
  if (s.rule === 'Spacing') return s.edits!.length > 1 ? `Fix all ${s.edits!.length}` : 'Fix the spacing';
  return `Change to “${s.edits![0]!.text}”`;
};

function Slips({ title, note, list, stale, all, onShow, onChange, onLeave }: { title: string; note?: string; list: Slip[]; stale: boolean; all: boolean; onShow: (s: Slip) => void; onChange: (e: Edit[], what: string) => void; onLeave: (s: Slip) => void }) {
  if (!list.length) return null;
  return (
    <div className="stack">
      <h3>{title}</h3>
      {note && <p className="soft">{note}</p>}
      <ul className={css.slips}>
        {list.slice(0, all ? undefined : SHOWN).map((s) => (
          <li key={`${s.rule}${s.start}`}>
            <div>
              <strong>{s.rule}</strong> <span className="soft">{s.say}</span>
              {s.text && s.text.length > 24 && <p className={css.sent}>{s.text.length > 220 ? `${s.text.slice(0, 220)}…` : s.text}</p>}
            </div>
            <div className="row">
              {s.edits && (
                <button className="btn" type="button" disabled={stale} onClick={() => onChange(s.edits!, `${s.rule}: ${s.text || s.say}`)}>
                  {fixLabel(s)}
                </button>
              )}
              <button className="btn quiet" type="button" disabled={stale} onClick={() => onShow(s)}>
                Show in the draft
              </button>
              <button className="btn quiet" type="button" onClick={() => onLeave(s)}>
                Leave it
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
