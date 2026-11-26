import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { go, Link } from '@/app/router';
import { auditReferences, checkPair, findClaims, linkClaim, overall, sourceOf, unsourced, type AuditClaim, type Bucket, type Link as ClaimLink, type PairResult } from '@/core/claims/audit';
import { directionSides, numberSides, scopeSides, type Bit, type Sides } from '@/core/claims/explain';
import { runGuards } from '@/core/claims/guards';
import type { Judged, Support } from '@/core/claims/label';
import { cancelSupport, loadSupport, onSupport, scoreSupport, SUPPORT_MB, supportState } from '@/core/claims/support';
import { CLAIM_TEXT, REASON_TEXT, VERDICT_TEXT, type RawReference, type ReferenceCheck, type RegistryTrace, type Verdict } from '@/core/contracts';
import { registries } from '@/core/registries';
import { cancelMeaning, embedder, loadMeaning, meaningState, onMeaning } from '@/core/semantic/meaning';
import { MEANING_MB } from '@/core/semantic/models';
import { cleanTitle } from '@/core/verify/normalise';
import { checkReference } from '@/core/verify/verdict';
import { AUDIT_SAMPLE, AUDIT_SAMPLE_NOTE } from '@/fixtures/audit-sample';
import { POLICY } from '@/policy/policy';
import { addSource, createProject } from '@/store/actions';
import { Legend } from '@/ui/Legend';
import { Receipt } from '@/ui/Receipt';
import { ClaimStamp, NotVerified, Stamp, VerdictStamp } from '@/ui/Stamp';
import css from './Audit.module.css';

/**
 * Audit a paragraph. A reviewer pastes text with its references; the checker looks up every reference and
 * judge() labels every claim against the reference it cites. Nothing is looked up before "Check it", nothing
 * is saved unless a project is started, and no AI decides anything.
 */

interface Item {
  id: number;
  ref: RawReference;
  check?: ReferenceCheck;
  state: 'waiting' | 'checking' | 'done' | 'cancelled';
}
interface Audit {
  claims: AuditClaim[];
  orphans: string[];
  trimmed: boolean;
}
/** One claim against one reference, with the check and the models it was worked out with. */
type Stored = { mode: string; check: ReferenceCheck; result: PairResult };

const T = POLICY.thresholds;
const MAX_REFS = 40;
const MAX_CLAIMS = 60;
const ORDER: Verdict[] = ['confirmed', 'one-registry', 'details-differ', 'wrong-paper', 'retracted', 'not-found', 'could-not-check'];
const REGISTRY: Record<RegistryTrace['registry'], string> = { crossref: 'Crossref', openalex: 'OpenAlex', datacite: 'DataCite', 'doi.org': 'doi.org' };
const STATUS: Record<RegistryTrace['status'], string> = { match: 'has it', 'no-match': 'no match', 'not-found': 'no record', error: 'did not answer', skipped: 'not asked' };
const BUCKETS: { key: Bucket; text: string; tone: 'ok' | 'warn' | 'mute'; mark: string }[] = [
  { key: 'verified', text: 'Verified', tone: 'ok', mark: CLAIM_TEXT.verified.mark },
  { key: 'disputed', text: 'Disputed', tone: 'warn', mark: CLAIM_TEXT.disputed.mark },
  { key: 'reported', text: 'Reported, not checked', tone: 'mute', mark: CLAIM_TEXT.reported.mark },
  { key: 'untraceable', text: 'not traceable', tone: 'mute', mark: '?' },
  { key: 'unchecked', text: 'not checked yet', tone: 'mute', mark: '…' },
];

const pct = (x: number): string => `${Math.round(x * 100)}%`;
const fixed = (x: number): string => x.toFixed(2);
const pairKey = (claimId: string, ref: number): string => `${claimId}|${ref}`;
/** The result for one claim and one reference, only while it belongs to that reference's current check. */
const resultFor = (pairs: Record<string, Stored>, items: Item[], claimId: string, ref: number): PairResult | undefined => {
  const had = pairs[pairKey(claimId, ref)];
  return had && had.check === items[ref]?.check ? had.result : undefined;
};

/** "[1] Bloom 2015", for headers and lists. */
function shortRef(it: Item): string {
  const family = it.check?.record?.authors[0]?.family ?? it.ref.authors?.[0];
  const year = it.ref.year ?? it.check?.record?.year;
  const name = family ? `${family}${year ? ` ${year}` : ''}` : (it.ref.doi ?? cleanTitle(it.ref.title ?? it.ref.raw).slice(0, 28));
  return `[${it.id + 1}] ${name}`;
}

/** Why a reference gives a claim nothing to compare with. Plain words for the checker's verdict. */
function noTextWhy(check: ReferenceCheck): string {
  if (check.verdict === 'not-found') return 'This reference was not found in the registries we searched, so there is no text to compare the claim with.';
  if (check.verdict === 'could-not-check') return 'A registry did not answer, so there is no text for this reference yet. Check it again above.';
  if (check.verdict === 'wrong-paper') return 'The DOI opens a different paper, so the claim was not compared with it.';
  return 'The registries hold no abstract for this work, so there is no text to compare the claim with. In a project you can add its PDF.';
}

/** Every lookup, in the order it happened: a DOI lookup and a title search at one registry are both shown. */
function where(check: ReferenceCheck): string {
  const said = check.trace.map((x) => `${REGISTRY[x.registry]} ${STATUS[x.status]}`).filter((x, i, all) => x !== all[i - 1]);
  return said.length ? said.join(' · ') : 'No registry was asked.';
}

export function Audit() {
  const [text, setText] = useState('');
  const [isSample, setIsSample] = useState(false);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [pairs, setPairs] = useState<Record<string, Stored>>({});
  const [chosen, setChosen] = useState<Record<string, number>>({});
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [fellBack, setFellBack] = useState(false);
  const meaning = useSyncExternalStore(onMeaning, meaningState);
  const model = useSyncExternalStore(onSupport, supportState);
  const run = useRef(0);
  const analysis = useRef(0);
  const stored = useRef<Record<string, Stored>>({});

  useEffect(() => {
    const changed = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', changed);
    window.addEventListener('offline', changed);
    return () => {
      // Answers that arrive after the page is left are ignored.
      run.current++;
      analysis.current++;
      window.removeEventListener('online', changed);
      window.removeEventListener('offline', changed);
    };
  }, []);

  const mode = `${meaning.status === 'ready' ? 'meaning' : 'words'}+${model.status === 'ready' ? 'support' : 'none'}`;
  const info = useMemo(() => items.map((it) => ({ ref: it.ref, record: it.check?.record })), [items]);
  const links = useMemo<Record<string, ClaimLink>>(() => Object.fromEntries((audit?.claims ?? []).map((c) => [c.id, linkClaim(c, info)])), [audit, info]);

  async function start(input: string) {
    const mine = ++run.current;
    analysis.current++;
    const x = auditReferences(input);
    const refs = x.references.slice(0, MAX_REFS);
    const all = findClaims(input, refs);
    setAudit({ claims: all.slice(0, MAX_CLAIMS), orphans: x.orphanCitations, trimmed: x.references.length > MAX_REFS || all.length > MAX_CLAIMS });
    stored.current = {};
    setPairs({});
    setChosen({});
    setFellBack(false);
    const list: Item[] = refs.map((ref, id) => ({ id, ref, state: 'waiting' }));
    setItems(list);
    if (!list.length) {
      setRunning(false);
      return;
    }
    setRunning(true);
    let next = 0;
    // Three at a time, like the Check page. The registry client spaces the requests out per registry.
    const worker = async () => {
      while (next < list.length && run.current === mine) {
        const it = list[next++]!;
        setItems((cur) => cur.map((c) => (c.id === it.id ? { ...c, state: 'checking' } : c)));
        const check = await checkReference(it.ref, registries);
        if (run.current !== mine) return;
        setItems((cur) => cur.map((c) => (c.id === it.id ? { ...c, check, state: 'done' } : c)));
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (run.current === mine) setRunning(false);
  }

  function cancel() {
    run.current++;
    setRunning(false);
    setItems((cur) => cur.map((c) => (c.check ? c : { ...c, state: 'cancelled' })));
  }

  async function again(it: Item) {
    const mine = run.current;
    setItems((cur) => cur.map((c) => (c.id === it.id ? { id: c.id, ref: c.ref, state: 'checking' } : c)));
    const check = await checkReference(it.ref, registries);
    if (run.current === mine) setItems((cur) => cur.map((c) => (c.id === it.id ? { ...c, check, state: 'done' } : c)));
  }

  // Every claim against every reference it links to, once that reference has been checked. Plain code, then judge().
  useEffect(() => {
    if (!audit) return;
    const gen = ++analysis.current;
    const embed = mode.startsWith('meaning') ? embedder : undefined;
    const score = mode.endsWith('support') ? (p: string, h: string): Promise<Support | null> => scoreSupport(p, h).catch(() => null) : undefined;
    void (async () => {
      for (const c of audit.claims) {
        for (const r of links[c.id]?.refs ?? []) {
          const check = items[r]?.check;
          const key = pairKey(c.id, r);
          const had = stored.current[key];
          // Worked out again when the models change, or when the reference was checked again.
          if (!check || (had?.mode === mode && had.check === check)) continue;
          const result = await checkPair(c.text, sourceOf(check), { embed, score });
          if (gen !== analysis.current) return;
          if (result.fellBack) setFellBack(true);
          stored.current = { ...stored.current, [key]: { mode, check, result } };
          setPairs(stored.current);
        }
      }
    })();
  }, [audit, items, links, mode]);

  const done = items.filter((i) => i.check);
  const tally = ORDER.map((v) => [v, done.filter((i) => i.check!.verdict === v).length] as const).filter(([, n]) => n > 0);
  const rows = (audit?.claims ?? []).map((c) => {
    const link = links[c.id] ?? { refs: [], how: 'none' as const, missing: [] };
    const cells = link.refs.map((r) => {
      const p = resultFor(pairs, items, c.id, r);
      return p ? { label: p.judged.label, hasText: p.hasText } : null;
    });
    const sum = overall(cells, link.how);
    return { c, link, sum, pickRef: sum.pick >= 0 ? link.refs[sum.pick]! : -1 };
  });
  const counts = BUCKETS.map((b) => ({ ...b, n: rows.filter((r) => r.sum.bucket === b.key).length })).filter((b) => b.n > 0);
  const verified = rows.filter((r) => r.sum.bucket === 'verified').length;
  const comparing = rows.reduce((n, r) => n + r.link.refs.filter((ref) => {
    const check = items[ref]?.check;
    const had = pairs[pairKey(r.c.id, ref)];
    return !!check && (had?.mode !== mode || had.check !== check);
  }).length, 0);
  const keepable = done.filter((i) => i.check!.record);

  function open(claimId: string, ref: number) {
    setChosen((cur) => ({ ...cur, [claimId]: ref }));
    const el = document.getElementById(`claim-${claimId}`);
    el?.scrollIntoView?.({ block: 'start' });
    el?.focus({ preventScroll: true });
  }

  return (
    <main className="wrap page" id="main" tabIndex={-1}>
      <div className="stack">
        <h1>Audit a paragraph</h1>
        <p className="soft">Paste a paragraph and its reference list, for example text an AI tool has polished. We look up every reference, then check every claim against the reference it cites. Plain code gives every label. No AI takes part.</p>
      </div>

      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void start(text);
        }}
      >
        <label htmlFor="audit-text">
          <strong>Paste a paragraph with its references</strong>
        </label>
        <textarea
          id="audit-text"
          className={`field ${css.area}`}
          value={text}
          spellCheck={false}
          placeholder={'Home working led to a 13% performance increase (Bloom et al., 2015).\n\nReferences\nBloom, N., Liang, J., Roberts, J., & Ying, Z. J. (2015). Does working from home work? …'}
          onChange={(e) => {
            setText(e.target.value);
            setIsSample(false);
          }}
        />
        <div className="row">
          <button className="btn main" type="submit" disabled={!text.trim() || running}>
            {running ? 'Checking…' : 'Check it'}
          </button>
          <button
            className="btn"
            type="button"
            disabled={running}
            onClick={() => {
              setText(AUDIT_SAMPLE);
              setIsSample(true);
              void start(AUDIT_SAMPLE);
            }}
          >
            Try the sample
          </button>
        </div>
        {isSample && (
          <p className={css.sampleNote}>
            <span className="sample">SAMPLE</span> {AUDIT_SAMPLE_NOTE}
          </p>
        )}
        {!online && <p className={css.note} role="status">You are offline. References cannot be looked up now, so they will show as Could not check. Claims are still found.</p>}
        <p className="soft">Nothing is looked up until you press Check it, and nothing is saved.</p>
      </form>

      {!audit && (
        <section className={css.how} aria-label="What happens when you check">
          <div>
            <h2>References</h2>
            <p className="soft">Each one is looked up in Crossref, OpenAlex, DataCite and doi.org, with a receipt saying where we looked.</p>
          </div>
          <div>
            <h2>Claims</h2>
            <p className="soft">Plain code cuts the paragraph into claims and finds what each one cites: (Author, Year), [1] or a DOI.</p>
          </div>
          <div>
            <h2>Traced or not</h2>
            <p className="soft">Each claim is compared with the abstract of the reference it cites. Verified only when the source says it and every check passes.</p>
          </div>
        </section>
      )}

      {audit && (
        <>
          <Summary
            running={running}
            checked={done.length}
            total={items.length}
            tally={tally}
            counts={counts}
            verified={verified}
            claims={rows.length}
            comparing={comparing}
            onCancel={cancel}
          />
          {audit.trimmed && <p className={css.note}>Only the first {MAX_REFS} references and {MAX_CLAIMS} claims are checked at once.</p>}
          {fellBack && <p className={css.note}>Finding by meaning did not work for every claim, so some sentences were found by shared words only.</p>}

          <section className="stack" aria-labelledby="audit-refs">
            <h2 id="audit-refs">References</h2>
            {!items.length && <p className={css.note}>We found no reference list or DOI in this text, so no claim can be traced. Paste the references under the paragraph.</p>}
            {audit.orphans.length > 0 && (
              <p className={css.warnLine}>
                <NotVerified /> Cited in the text with no entry in the list: <strong>{audit.orphans.join('; ')}</strong>
              </p>
            )}
            {items.length > 0 && (
              <ol className={css.refs} aria-label="References and their checks">
                {items.map((it) => (
                  <RefCard key={it.id} it={it} onAgain={() => void again(it)} />
                ))}
              </ol>
            )}
          </section>

          <section className="stack" aria-labelledby="audit-claims">
            <h2 id="audit-claims">Claims</h2>
            {!rows.length ? (
              <p className={css.note}>We found no sentences to trace above the reference list. Paste the paragraph as well as its references.</p>
            ) : (
              <>
                <p className="soft">Each claim is compared with the abstract of the reference it cites, so this is abstract only: a claim from the full text will show as Reported, not checked.</p>
                {items.length > 0 && <MeaningBox meaning={meaning} model={model} />}
                {items.length > 0 && <Matrix rows={rows} items={items} pairs={pairs} onOpen={open} />}
                <ol className={css.claims} aria-label="Claim cards">
                  {rows.map((r, i) => (
                    <ClaimCard key={r.c.id} n={i + 1} c={r.c} link={r.link} bucket={r.sum.bucket} items={items} pairs={pairs} chosen={chosen[r.c.id] ?? r.pickRef} modelOn={model.status === 'ready'} onChoose={(ref) => setChosen((cur) => ({ ...cur, [r.c.id]: ref }))} />
                  ))}
                </ol>
              </>
            )}
          </section>

          {!running && keepable.length > 0 && <Keep items={keepable} />}
        </>
      )}

      <Legend />
      <p className="soft">
        Not found means none of the registries we searched has a record of it. Some real books and regional journals are not indexed. <Link to="/rules">See what we can and cannot check</Link>.
      </p>
    </main>
  );
}

function Summary(p: { running: boolean; checked: number; total: number; tally: readonly (readonly [Verdict, number])[]; counts: { key: Bucket; text: string; tone: 'ok' | 'warn' | 'mute'; mark: string; n: number }[]; verified: number; claims: number; comparing: number; onCancel: () => void }) {
  return (
    <section className={`card ${css.summary}`} aria-labelledby="audit-summary">
      <h2 id="audit-summary">Summary</h2>
      <div className={css.tallies}>
        <div className="stack" role="status" aria-live="polite">
          <h3>References</h3>
          <p>{p.total === 0 ? 'None found.' : p.running ? `Checked ${p.checked} of ${p.total}…` : `${p.checked} of ${p.total} checked.`}</p>
          {p.tally.length > 0 && (
            <div className="row">
              {p.tally.map(([v, n]) => (
                <Stamp key={v} tone={VERDICT_TEXT[v].tone} mark={VERDICT_TEXT[v].mark}>
                  {n} {VERDICT_TEXT[v].label.toLowerCase()}
                </Stamp>
              ))}
            </div>
          )}
        </div>
        <div className="stack">
          <h3>Claims</h3>
          <p>{p.claims === 0 ? 'None found.' : p.comparing > 0 ? `Comparing claims with their sources, ${p.comparing} left…` : `${p.claims} ${p.claims === 1 ? 'claim' : 'claims'} found.`}</p>
          {p.counts.length > 0 && (
            <div className="row">
              {p.counts.map((b) => (
                <Stamp key={b.key} tone={b.tone} mark={b.mark}>
                  {b.n} {b.text}
                </Stamp>
              ))}
            </div>
          )}
        </div>
      </div>
      {p.claims > 0 && (
        <p className={css.traced}>
          Traced: {p.verified} of {p.claims} {p.claims === 1 ? 'claim' : 'claims'} verified against their cited sources.
        </p>
      )}
      <p className="soft">This counts whether the cited sources say these things. It is not a truth score for the paragraph.</p>
      {p.running && (
        <div className="row">
          <button className="btn" type="button" onClick={p.onCancel}>
            Cancel the check
          </button>
          <span className="soft">Answers that arrive after you cancel are ignored.</span>
        </div>
      )}
    </section>
  );
}

function RefCard({ it, onAgain }: { it: Item; onAgain: () => void }) {
  const c = it.check;
  const abstract = c && sourceOf(c).text;
  return (
    <li className={`card ${css.ref}`} data-verdict={c?.verdict}>
      <div className={css.refHead}>
        <span className={css.num}>[{it.id + 1}]</span>
        <div className={css.refText}>
          <p className={css.refTitle}>{it.ref.title ?? it.ref.raw}</p>
          <p className={css.sub}>{[it.ref.authors?.join(', '), it.ref.year, it.ref.doi].filter(Boolean).join(' · ') || 'No author, year or DOI given'}</p>
        </div>
        <div className={css.refStamp}>
          {c ? <VerdictStamp verdict={c.verdict} land /> : it.state === 'cancelled' ? <NotVerified /> : <span className="soft">{it.state === 'checking' ? 'Checking…' : 'Waiting…'}</span>}
        </div>
      </div>
      {it.state === 'cancelled' && <p className="soft">Not checked: the check was cancelled.</p>}
      {c && (
        <>
          <p className={css.looked}>Where we looked: {where(c)}</p>
          {c.reasons.length > 0 && <p className="soft">{c.reasons.map((r) => REASON_TEXT[r]).join(' ')}</p>}
          <p className={abstract ? css.textOk : css.textNone}>{abstract ? 'Abstract only: claims are compared with its abstract.' : noTextWhy(c)}</p>
          <ReceiptBox check={c} raw={it.ref} />
          {(c.verdict === 'could-not-check' || c.verdict === 'one-registry') && (
            <div className="row">
              <button className="btn" type="button" onClick={onAgain}>
                Check again
              </button>
            </div>
          )}
        </>
      )}
    </li>
  );
}

/** The full receipt, drawn only when opened, so a closed box holds no second stamp. */
function ReceiptBox({ check, raw }: { check: ReferenceCheck; raw: RawReference }) {
  const [open, setOpen] = useState(false);
  return (
    <details className={css.details} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Show the receipt</summary>
      {open && <Receipt check={check} raw={raw} />}
    </details>
  );
}

function MeaningBox({ meaning, model }: { meaning: ReturnType<typeof meaningState>; model: ReturnType<typeof supportState> }) {
  const loading = meaning.status === 'loading' || model.status === 'loading';
  const ready = meaning.status === 'ready' && model.status === 'ready';
  const stopBoth = () => {
    cancelMeaning();
    cancelSupport();
  };
  const failed = [meaning, model].flatMap((s) => (s.status === 'failed' ? [s.why] : []));
  return (
    <div className={css.meaning}>
      {ready ? (
        <>
          <p>
            <strong>Meaning is compared on this device.</strong> The meaning model puts the sentences in order and the support model scores each one. Verified still needs every check to pass.
          </p>
          <div className="row">
            <button className="btn" type="button" onClick={stopBoth}>
              Turn off and free the memory
            </button>
          </div>
        </>
      ) : loading ? (
        <>
          <ModelProgress name="meaning model" state={meaning} />
          <ModelProgress name="support model" state={model} />
          <div className="row">
            <button className="btn" type="button" onClick={stopBoth}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="soft">
            A claim in other words than its source is Reported, not checked, until the meaning is compared. Two small models can do that on this device: they download about {MEANING_MB + SUPPORT_MB} MB once ({MEANING_MB} MB to find sentences by meaning, {SUPPORT_MB} MB to score support), then load from this browser. Your paragraph is not sent anywhere.
          </p>
          <div className="row">
            <button
              className="btn"
              type="button"
              onClick={() => {
                loadMeaning();
                loadSupport();
              }}
            >
              Compare the meaning on this device
            </button>
          </div>
        </>
      )}
      {failed.map((why) => (
        <p key={why} role="alert" className={css.warnLine}>
          {why}
        </p>
      ))}
    </div>
  );
}

function ModelProgress({ name, state }: { name: string; state: ReturnType<typeof meaningState> }) {
  if (state.status === 'ready') return <p className="soft">The {name} is ready.</p>;
  if (state.status !== 'loading') return null;
  return (
    <label className="stack">
      <span>
        Loading the {name}
        {state.total ? `, ${Math.round(state.loaded / 1e6)} of ${Math.round(state.total / 1e6)} MB` : ''}
      </span>
      <progress className={css.progress} {...(state.total ? { value: state.loaded, max: state.total } : {})} />
    </label>
  );
}

type Row = { c: AuditClaim; link: ClaimLink; sum: { bucket: Bucket; pick: number }; pickRef: number };

/** Claims down, references across. Arrow keys move between the cells that can be opened. */
function Matrix({ rows, items, pairs, onOpen }: { rows: Row[]; items: Item[]; pairs: Record<string, Stored>; onOpen: (claimId: string, ref: number) => void }) {
  function move(e: React.KeyboardEvent<HTMLTableElement>) {
    const t = e.target as HTMLElement;
    const step = ({ ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] } as Record<string, [number, number]>)[e.key];
    if (!step || t.dataset.row === undefined) return;
    const r = Number(t.dataset.row);
    const c = Number(t.dataset.col);
    const cells = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-row]')].map((b) => ({ b, r: Number(b.dataset.row), c: Number(b.dataset.col) }));
    const [dr, dc] = step;
    const ahead = cells.filter((x) => (dr ? Math.sign(x.r - r) === dr : x.r === r && Math.sign(x.c - c) === dc));
    const next = ahead.sort((a, b) => Math.abs(a.r - r) - Math.abs(b.r - r) || Math.abs(a.c - c) - Math.abs(b.c - c))[0];
    if (next) {
      e.preventDefault();
      next.b.focus();
    }
  }
  return (
    <div className={css.matrixWrap} role="region" aria-label="Claims against references" tabIndex={0}>
      <table className={css.matrix} onKeyDown={move}>
        <caption className={css.caption}>Each claim against each reference it is checked with: the label, and the support score when the meaning was compared. Open a cell to see why.</caption>
        <thead>
          <tr>
            <th scope="col">Claim</th>
            {items.map((it) => (
              <th scope="col" key={it.id}>
                {shortRef(it)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={row.c.id}>
              <th scope="row">
                <span className={css.claimNo}>{ri + 1}.</span> {row.c.text}
              </th>
              {items.map((it) => {
                const linked = row.link.refs.includes(it.id);
                const p = resultFor(pairs, items, row.c.id, it.id);
                if (!linked)
                  return (
                    <td key={it.id} className={css.off} data-ref={shortRef(it)}>
                      <span aria-hidden="true">–</span>
                      <span className="sr">Not cited</span>
                    </td>
                  );
                const s = p ? (p.support[p.pick] ?? null) : null;
                return (
                  <td key={it.id} data-ref={shortRef(it)}>
                    <button type="button" className={css.cell} data-row={ri} data-col={it.id} onClick={() => onOpen(row.c.id, it.id)}>
                      <span className="sr">
                        Claim {ri + 1} against {shortRef(it)}:{' '}
                      </span>
                      {p ? <ClaimStamp label={p.judged.label} /> : <span className="soft">{it.state === 'cancelled' ? 'Not checked' : 'Checking…'}</span>}
                      <span className={css.cellScore}>{p ? cellNote(p, s) : ''}</span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The small line under a label in the matrix. */
function cellNote(p: PairResult, s: Support | null): string {
  if (s) return `support ${pct(s.entails)}`;
  if (!p.hasText) return 'no text';
  if (!p.candidates.length) return 'no close sentence';
  return p.judged.wordForWord ? 'word for word' : 'meaning not compared';
}

function ClaimCard(p: { n: number; c: AuditClaim; link: ClaimLink; bucket: Bucket; items: Item[]; pairs: Record<string, Stored>; chosen: number; modelOn: boolean; onChoose: (ref: number) => void }) {
  const { c, link } = p;
  const ref = link.refs.includes(p.chosen) ? p.chosen : (link.refs[0] ?? -1);
  const it = ref >= 0 ? p.items[ref] : undefined;
  const pair = ref >= 0 ? resultFor(p.pairs, p.items, c.id, ref) : undefined;
  const none = link.how === 'none' ? unsourced(c.text) : null;
  const shown = pair?.judged ?? none;
  return (
    <li id={`claim-${c.id}`} className={`card ${css.claim}`} data-label={shown?.label} tabIndex={-1}>
      <p className={css.claimText}>
        <span className={css.claimNo}>{p.n}.</span> {c.text}
      </p>
      {c.part && <p className="soft">One part of: “{c.sentence.trim()}”</p>}
      {link.how === 'all' && <p className="soft">This sentence cites nothing we could match, so it was checked against every reference.</p>}
      {link.missing.length > 0 && <p className={css.warnLine}>Cited with no entry in the reference list: {link.missing.join('; ')}.</p>}
      {link.refs.length > 1 && (
        <fieldset className={css.pick}>
          <legend>Against which reference</legend>
          {link.refs.map((r) => {
            const x = resultFor(p.pairs, p.items, c.id, r);
            return (
              <label key={r}>
                <input type="radio" name={`pick-${c.id}`} checked={r === ref} onChange={() => p.onChoose(r)} /> {shortRef(p.items[r]!)} {x && <ClaimStamp label={x.judged.label} />}
              </label>
            );
          })}
        </fieldset>
      )}
      {none ? (
        <div className="stack">
          <span className="land">
            <ClaimStamp label={none.label} />
          </span>
          <p>{CLAIM_TEXT[none.label].plain}</p>
          <p className="soft">There is no reference to trace this claim to.</p>
        </div>
      ) : !it?.check ? (
        <div className="row">
          <NotVerified />
          <span className="soft">{it?.state === 'cancelled' ? 'Not checked: the reference check was cancelled.' : 'Waiting for the reference to be checked…'}</span>
        </div>
      ) : !pair ? (
        <p role="status" className="soft">
          Comparing with {shortRef(it)}…
        </p>
      ) : (
        <PairDetail claim={c.text} it={it} pair={pair} modelOn={p.modelOn} bucket={p.bucket} />
      )}
    </li>
  );
}

function PairDetail({ claim, it, pair, modelOn, bucket }: { claim: string; it: Item; pair: PairResult; modelOn: boolean; bucket: Bucket }) {
  const check = it.check!;
  const j = pair.judged;
  const best = pair.candidates[pair.pick];
  const support = pair.support[pair.pick] ?? null;
  const t = CLAIM_TEXT[j.label];
  return (
    <div className={css.pair}>
      <div className="row">
        <span className="land" key={j.label}>
          <ClaimStamp label={j.label} />
        </span>
        {bucket === 'untraceable' && <span className="soft">Not traceable</span>}
        <span className={css.against}>
          against {shortRef(it)} <VerdictStamp verdict={check.verdict} />
        </span>
      </div>
      <p>{t.plain}</p>
      {j.reasons.length > 0 && (
        <ul className={css.reasons}>
          {j.reasons.map((r) => (
            <li key={r}>{REASON_TEXT[r]}</li>
          ))}
        </ul>
      )}
      {!pair.hasText ? (
        <p className={css.textNone}>{noTextWhy(check)}</p>
      ) : !best ? (
        <p className={css.textNone}>No sentence in this abstract is close to the claim.</p>
      ) : (
        <>
          <figure className={css.quote}>
            <figcaption>
              Closest sentence in the source <span className={css.tag}>abstract only</span>
            </figcaption>
            <blockquote>
              <Marked text={best.text} bits={[...(numberSides(claim, best.text)?.source ?? []), ...(directionSides(claim, best.text)?.source ?? []), ...(scopeSides(claim, best.text)?.source ?? [])]} />
            </blockquote>
          </figure>
          {pair.against >= 0 && <p className={css.warnLine}>Another close sentence may say the opposite: “{pair.candidates[pair.against]!.text}” Read it before you rely on this.</p>}
          {pair.pick > 0 && <p className="soft">This is close sentence {pair.pick + 1} of {pair.candidates.length}: it says the claim word for word.</p>}
          <Checks claim={claim} passage={best.text} judged={j} />
          <ModelScores support={support} wordForWord={j.wordForWord} modelOn={modelOn} />
          <Aids words={best.words} meaning={best.meaning} />
          {pair.candidates.length > 1 && (
            <details className={css.details}>
              <summary>Other close sentences ({pair.candidates.length - 1})</summary>
              <ul className={css.others}>
                {pair.candidates.map((x, i) =>
                  i === pair.pick ? null : (
                    <li key={`${x.start}:${x.end}`}>
                      “{x.text}”
                      <span className={css.scoreLine}>{scoreLine(x.words, x.meaning, pair.support[i] ?? null)}</span>
                    </li>
                  ),
                )}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function scoreLine(words: number, meaning: number | null, s: Support | null): string {
  return [`Words shared ${pct(words)}`, meaning !== null ? `meaning match ${fixed(meaning)}` : '', s ? `support ${pct(s.entails)}` : '', s ? `contradiction ${pct(s.contradicts)}` : ''].filter(Boolean).join(' · ');
}

/** The source sentence with the words that differ from the claim marked. For showing only; judge() decided the label. */
function Marked({ text, bits }: { text: string; bits: Bit[] }) {
  const lower = text.toLowerCase();
  const spans: { start: number; end: number }[] = [];
  for (const b of bits) {
    if (!b.differs || !b.text.trim()) continue;
    let from = 0;
    for (;;) {
      const at = lower.indexOf(b.text.toLowerCase(), from);
      if (at < 0) break;
      const end = at + b.text.length;
      const edge = (ch: string | undefined) => !ch || !/[\p{L}\p{N}]/u.test(ch);
      if (edge(text[at - 1]) && edge(text[end]) && !spans.some((s) => at < s.end && end > s.start)) {
        spans.push({ start: at, end });
        break;
      }
      from = at + 1;
    }
  }
  if (!spans.length) return <>{text}</>;
  const out: ReactNode[] = [];
  let at = 0;
  for (const s of spans.sort((a, b) => a.start - b.start)) {
    out.push(text.slice(at, s.start), <strong key={s.start} className={css.diff}>{text.slice(s.start, s.end)}</strong>);
    at = s.end;
  }
  out.push(text.slice(at));
  return <>{out}</>;
}

function Diff({ bits }: { bits: Bit[] }) {
  if (!bits.length) return <span className="soft">none</span>;
  return (
    <>
      {bits.map((b, i) => (
        <span key={`${b.text}-${i}`}>
          {i > 0 && ', '}
          {b.differs ? <strong className={css.diff}>{b.text}</strong> : b.text}
        </span>
      ))}
    </>
  );
}

function SideBySide({ sides }: { sides: Sides | null }) {
  if (!sides) return null;
  return (
    <span className={css.sides}>
      Claim: <Diff bits={sides.you} /> · Source: <Diff bits={sides.source} />
    </span>
  );
}

/** The plain-code checks, with what each side says. The values come from judge(). */
function Checks({ claim, passage, judged }: { claim: string; passage: string; judged: Judged }) {
  const g = useMemo(() => runGuards(claim, passage), [claim, passage]);
  const rows: [string, boolean | null, Sides | null, string?][] = [
    ['Numbers match, for the same thing', judged.checks.numbers, numberSides(claim, passage), g.numbers === 'conflict' ? 'differs' : g.numbers === 'missing' ? 'not in this sentence' : undefined],
    ['Same direction', judged.checks.direction, directionSides(claim, passage), g.direction === 'conflict' || g.negation === 'conflict' ? 'the opposite' : g.direction === 'missing' || g.negation === 'missing' ? 'unclear' : undefined],
    ['Not wider or more certain', judged.checks.scope, scopeSides(claim, passage), g.scope === 'conflict' ? 'goes further' : g.scope === 'missing' ? 'not covered' : undefined],
  ];
  return (
    <table className={css.checks}>
      <caption className="sr">Checks on this claim against the sentence</caption>
      <tbody>
        <tr data-v={judged.wordForWord ? 'true' : 'null'}>
          <th scope="row">The claim’s words appear in the source</th>
          <td>{judged.wordForWord ? '✓ word for word' : 'no, in other words'}</td>
        </tr>
        {rows.map(([name, v, sides, why]) => (
          <tr key={name} data-v={String(v)}>
            <th scope="row">
              {name}
              <SideBySide sides={sides} />
            </th>
            <td>{v === true ? '✓ yes' : v === false ? `≠ no${why ? `, ${why}` : ''}` : 'nothing to check'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Bar({ name, value, shown, tone, mark }: { name: string; value: number; shown: string; tone: 'model' | 'neutral' | 'against' | 'aid'; mark?: number }) {
  return (
    <div className={css.bar} data-tone={tone}>
      <span>{name}</span>
      <span className={css.value}>{shown}</span>
      <span className={css.track} aria-hidden="true">
        <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
        {mark !== undefined && <b style={{ left: `${mark * 100}%` }} />}
      </span>
    </div>
  );
}

function ModelScores({ support, wordForWord, modelOn }: { support: Support | null; wordForWord: boolean; modelOn: boolean }) {
  return (
    <div className={css.scores}>
      <h3>Meaning, from the model on this device</h3>
      {support ? (
        <>
          <Bar name="Support" value={support.entails} shown={pct(support.entails)} tone="model" mark={T.supportVerified} />
          <p className={css.rule}>The line is at {pct(T.supportVerified)}. Verified needs support at or above it, and every check passing.</p>
          <Bar name="Neutral" value={support.neutral ?? 0} shown={support.neutral === undefined ? 'not given' : pct(support.neutral)} tone="neutral" />
          <Bar name="Contradiction" value={support.contradicts} shown={pct(support.contradicts)} tone="against" mark={T.contradiction} />
          <p className={css.rule}>The line is at {pct(T.contradiction)}. At or above it the label is Disputed.</p>
          <p className="soft">How this one sentence relates to the claim. It is not the chance that the claim is true.</p>
        </>
      ) : (
        <p className="soft">{wordForWord ? 'Not needed: the claim is in the source’s own words.' : modelOn ? 'The model gave no score for this sentence.' : 'Not compared yet. Use Compare the meaning on this device, above.'}</p>
      )}
    </div>
  );
}

function Aids({ words, meaning }: { words: number; meaning: number | null }) {
  return (
    <div className={css.scores}>
      <h3>Ranking aids</h3>
      <p className="soft">These put sentences in order. They never decide the label.</p>
      {meaning !== null ? <Bar name="Meaning match" value={meaning} shown={fixed(meaning)} tone="aid" /> : <p className="soft">Meaning match: not measured, the meaning model is off.</p>}
      <Bar name="Words shared" value={words} shown={pct(words)} tone="aid" />
    </div>
  );
}

/** Optional: put the references a registry found into a new project. The student approves each one there. */
function Keep({ items }: { items: Item[] }) {
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function keep(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 8) {
      setError('Write the project question in a few words first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const p = await createProject(q, 'apa', 1);
      for (const it of items) await addSource(p.id, 'check', { raw: it.ref, check: it.check! });
      go(`/p/${p.id}/library`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
      setBusy(false);
    }
  }
  return (
    <form className={`card ${css.keep}`} onSubmit={keep} noValidate aria-labelledby="audit-keep">
      <h2 id="audit-keep">Keep these sources</h2>
      <p className="soft">
        Nothing above is saved. To work with these sources, start a project: the {items.length} {items.length === 1 ? 'reference' : 'references'} a registry found go into its library, and you approve each one there.
      </p>
      <label className="stack" htmlFor="audit-question">
        <strong>Project question</strong>
      </label>
      <input id="audit-question" className="field" value={q} placeholder="Does remote work improve employee productivity?" onChange={(e) => { setQ(e.target.value); setError(''); }} aria-invalid={!!error} aria-describedby={error ? 'audit-question-error' : undefined} />
      {error && (
        <p id="audit-question-error" role="alert" className={css.warnLine}>
          {error}
        </p>
      )}
      <div className="row">
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Starting…' : 'Start a project with these sources'}
        </button>
      </div>
    </form>
  );
}
