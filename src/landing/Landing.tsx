import { useCallback, useEffect, useRef, useState } from 'react';
import { go, Link } from '@/app/router';
import type { RawReference, ReferenceCheck } from '@/core/contracts';
import { registries } from '@/core/registries';
import { extractReferences } from '@/core/verify/parse';
import { checkReference } from '@/core/verify/verdict';
import { EXAMPLES } from '@/fixtures/sample';
import { HANDOFF } from '@/pages/Check';
import { AGENTS, AI_LEVELS } from '@/policy/policy';
import { Receipt } from '@/ui/Receipt';
import css from './Landing.module.css';
import { LAMP_TITLES } from './titles';

const HALLUCINATED_2025 = 146_932;

function useRoom(canvas: React.RefObject<HTMLCanvasElement | null>, broken: React.RefObject<number>) {
  const halo = useRef<HTMLDivElement>(null);
  const tag = useRef<HTMLDivElement>(null);
  const rings = useRef<(HTMLDivElement | null)[]>([]);
  const chapters = useRef<(HTMLElement | null)[]>([]);
  const [day, setDay] = useState(false);
  const [gl, setGl] = useState<'wait' | 'on' | 'off'>('wait');
  const small = typeof window !== 'undefined' && window.innerWidth < 720;
  const sheets = small ? 420 : 980;

  const stage = useCallback((): number => {
    const els = chapters.current;
    if (els.length < 6 || els.some((e) => !e)) return 0;
    const y = window.scrollY + window.innerHeight * 0.5;
    const pts = els.map((e, i) => e!.getBoundingClientRect().top + window.scrollY + (i === 5 ? window.innerHeight * 0.5 : e!.offsetHeight * 0.5));
    if (y <= pts[0]!) return 0;
    for (let i = 0; i < 5; i++) {
      if (y < pts[i + 1]!) {
        const f = Math.min(1, Math.max(0, ((y - pts[i]!) / (pts[i + 1]! - pts[i]!) - 0.22) / 0.56));
        return i + f * f * (3 - 2 * f);
      }
    }
    return 5;
  }, []);

  useEffect(() => {
    const force = new URLSearchParams(window.location.search);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches || force.has('still');
    const save = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    let stop: (() => void) | null = null;
    let gone = false;
    let isDay = false;
    const mood = (s: number) => {
      const d = s > 4.62;
      if (d !== isDay) {
        isDay = d;
        setDay(d);
      }
    };
    const plain = () => mood(stage());
    const fallback = () => {
      setGl('off');
      window.addEventListener('scroll', plain, { passive: true });
      plain();
    };
    if (force.has('nogl') || save || !canvas.current) fallback();
    else
      // Text first. The scene and three.js load after the page is usable.
      void import('./scene')
        .then(({ startScene }) => {
          if (gone || !canvas.current) return;
          let last = -1;
          stop = startScene({
            canvas: canvas.current,
            sheets,
            still,
            stage,
            broken: () => broken.current ?? 0,
            onStage: mood,
            onLost: () => {
              stop?.();
              stop = null;
              fallback();
            },
            onRings: (p, visible) =>
              rings.current.forEach((el, i) => {
                if (!el) return;
                el.style.transform = `translate(${p[i]!.x.toFixed(1)}px, ${p[i]!.y.toFixed(1)}px)`;
                el.style.opacity = visible ? '1' : '0';
              }),
            onLamp: (x, y, target) => {
              if (halo.current) halo.current.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
              const el = tag.current;
              if (!el) return;
              if (!target || target.x < window.innerWidth * 0.5) {
                el.style.opacity = '0';
                last = -1;
                return;
              }
              if (target.index !== last) {
                last = target.index;
                const t = LAMP_TITLES[target.index % LAMP_TITLES.length]!;
                el.dataset.hollow = String(target.hollow);
                el.children[0]!.textContent = target.hollow ? 'Hollow' : 'Real';
                el.children[1]!.textContent = target.hollow ? 'No registry has this paper.' : t[0];
                el.children[2]!.textContent = target.hollow ? '' : `${t[1]} · ${t[2]}`;
              }
              el.style.transform = `translate(${Math.min(window.innerWidth - 290, target.x + 26).toFixed(0)}px, ${Math.min(window.innerHeight - 150, target.y + 18).toFixed(0)}px)`;
              el.style.opacity = '1';
            },
          });
          if (stop) setGl('on');
          else fallback();
        })
        .catch(() => {
          if (!gone) fallback();
        });
    return () => {
      gone = true;
      stop?.();
      window.removeEventListener('scroll', plain);
    };
  }, [canvas, broken, sheets, stage]);

  return { halo, tag, rings, chapters, day, gl, sheets };
}

export function Landing() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const broken = useRef(1);
  const room = useRoom(canvas, broken);
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ raw: RawReference; check: ReferenceCheck } | 'busy' | 'none' | null>(null);
  const [claim, setClaim] = useState<13 | 31>(31);
  const [level, setLevel] = useState(2);
  const [touring, setTouring] = useState(false);
  const run = useRef(0);

  useEffect(() => {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.classList.add('room');
    return () => document.documentElement.classList.remove('room');
  }, []);
  useEffect(() => {
    broken.current = claim === 31 ? 1 : 0;
  }, [claim]);

  const set = (i: number) => (el: HTMLElement | null) => {
    room.chapters.current[i] = el;
  };

  async function check(input: string) {
    const x = extractReferences(input);
    if (x.references.length > 1) {
      try {
        sessionStorage.setItem(HANDOFF, input);
      } catch {
        /* storage is blocked: the Check page opens empty */
      }
      go('/check');
      return;
    }
    const raw = x.references[0];
    if (!raw) {
      setResult('none');
      return;
    }
    const mine = ++run.current;
    setResult('busy');
    const c = await checkReference(raw, registries);
    if (run.current === mine) setResult({ raw, check: c });
  }

  const scrollTo = useCallback(
    (i: number) => {
      const el = room.chapters.current[i];
      if (!el) return;
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: i === 0 ? 0 : i === 5 ? top + 40 : top + el.offsetHeight / 2 - window.innerHeight / 2, behavior: still ? 'auto' : 'smooth' });
    },
    [room.chapters],
  );

  useEffect(() => {
    if (!touring) return;
    const steps: [number, () => void][] = [
      [5000, () => scrollTo(0)],
      [7000, () => scrollTo(1)],
      [8000, () => scrollTo(2)],
      [6500, () => { setClaim(31); scrollTo(3); }],
      [5500, () => setClaim(13)],
      [6000, () => { setLevel(2); scrollTo(4); }],
      [4500, () => setLevel(0)],
      [8000, () => scrollTo(5)],
    ];
    let i = 0;
    let timer = 0;
    const stop = () => setTouring(false);
    const next = () => {
      const s = steps[i++];
      if (!s) return stop();
      s[1]();
      timer = window.setTimeout(next, s[0]);
    };
    next();
    const ev = ['wheel', 'touchstart', 'keydown'] as const;
    ev.forEach((n) => window.addEventListener(n, stop, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      ev.forEach((n) => window.removeEventListener(n, stop));
    };
  }, [touring, scrollTo]);

  const broke = claim === 31;
  return (
    <div className={css.room} data-day={room.day} data-gl={room.gl}>
      <canvas ref={canvas} className={css.gl} aria-hidden="true" />
      <div ref={room.halo} className={css.halo} aria-hidden="true" />
      <div className={css.scrim} aria-hidden="true" />
      <div ref={room.tag} className={css.tag} aria-hidden="true">
        <b />
        <i />
        <span />
      </div>
      {['Found|by a registry', 'Checked|by plain code', 'Approved|by you'].map((s, i) => (
        <div key={s} ref={(el) => { room.rings.current[i] = el; }} className={css.ring} aria-hidden="true">
          <b>{s.split('|')[0]}</b>
          <span>{s.split('|')[1]}</span>
        </div>
      ))}

      <header className={css.nav}>
        <div className={css.gut}>
          <Link to="/" className={css.mark}>
            Paper Trail
          </Link>
          <nav aria-label="Main">
            <Link to="/check">Check</Link>
            <Link to="/lab">Integrity Lab</Link>
            <Link to="/rules">House rules</Link>
          </nav>
          <Link to="/projects" className={css.btn}>
            Open workspace
          </Link>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <section className={css.ch} ref={set(0)}>
          <div className={css.gut}>
            <div className={css.col}>
              <h1>Eighteen in a hundred of these papers do not exist.</h1>
              <p>Same layout. Same confidence. Move the light and see which ones are hollow.</p>
              <form
                className={css.field}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (text.trim()) void check(text);
                }}
              >
                <div className={css.row}>
                  <label className="sr" htmlFor="hero-check">
                    Reference, DOI or paragraph to check
                  </label>
                  <input
                    id="hero-check"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onPaste={(e) => {
                      // A single-line box would flatten a pasted list, so hand long text to the Check page whole.
                      const t = e.clipboardData.getData('text');
                      if (t.includes('\n') && extractReferences(t).references.length > 1) {
                        e.preventDefault();
                        void check(t);
                      }
                    }}
                    placeholder="Paste a reference, a DOI or a paragraph"
                    autoComplete="off"
                  />
                  <button type="submit">Check</button>
                </div>
                <div className={css.chips}>
                  {EXAMPLES.map((x) => (
                    <button
                      key={x.key}
                      type="button"
                      className={css.chip}
                      onClick={() => {
                        setText(x.text);
                        void check(x.text);
                      }}
                    >
                      {x.label}
                    </button>
                  ))}
                </div>
                <div role="status" aria-live="polite">
                  {result === 'busy' && <p className={css.small}>Asking Crossref, OpenAlex and doi.org…</p>}
                  {result === 'none' && <p className={css.small}>No reference found in that. Paste a DOI, a title or a full reference.</p>}
                  {result && typeof result === 'object' && (
                    <Receipt check={result.check} raw={result.raw} live>
                      <Link to="/check" className="btn">
                        Check a whole list
                      </Link>
                    </Receipt>
                  )}
                </div>
              </form>
              <p className={css.small}>
                18% of GPT-4&rsquo;s citations were fabricated in a 2023 test.{' '}
                <a href="https://doi.org/10.1038/s41598-023-41032-5" target="_blank" rel="noreferrer">
                  Walters &amp; Wilder, Scientific Reports
                </a>
                . Titles under the lamp are real papers whose DOIs we resolved.
              </p>
              <button type="button" className={css.tour} onClick={() => setTouring(!touring)}>
                {touring ? 'Stop the tour' : 'Play the 60-second tour'}
              </button>
            </div>
          </div>
        </section>
        <div className={css.gap} />

        <section className={css.ch} ref={set(1)}>
          <div className={css.gut}>
            <div className={css.col} style={{ maxWidth: 900 }}>
              <h2 className={css.huge}>{HALLUCINATED_2025.toLocaleString('en')}</h2>
              <p className={css.big}>hallucinated citations in the 2025 literature, on a conservative estimate. Each sheet in this room now stands for {Math.round(HALLUCINATED_2025 / room.sheets)} of them.</p>
              <p className={css.small}>
                Peer review catches only a fraction, and the errors over-credit scholars who are already famous.{' '}
                <a href="https://arxiv.org/abs/2605.07723" target="_blank" rel="noreferrer">
                  Zhao et al., 2026
                </a>
              </p>
            </div>
          </div>
        </section>
        <div className={css.gap} />

        <section className={`${css.ch} ${css.top}`} ref={set(2)}>
          <div className={css.gut}>
            <div className={css.col} style={{ maxWidth: 820 }}>
              <h2>Three keys, or it does not get in.</h2>
              <p>A registry finds it. Plain code checks it. You approve it. The AI holds none of the keys, so it cannot put a reference in your paper.</p>
            </div>
          </div>
        </section>
        <div className={css.gap} />

        <section className={css.ch} ref={set(3)}>
          <div className={css.gut}>
            <div className={`${css.col} ${css.tight}`}>
              <h2>The paper is real. Does it say that?</h2>
              <div className={css.seg} role="group" aria-label="Change the number in the claim">
                {([13, 31] as const).map((n) => (
                  <button key={n} type="button" aria-pressed={claim === n} onClick={() => setClaim(n)}>
                    {n}%
                  </button>
                ))}
              </div>
              <div className={css.trail} data-broken={broke}>
                <div className={css.step}>
                  <small>Your sentence</small>
                  <span>
                    Home working lifted performance by <mark>{claim}%</mark>.
                  </span>
                </div>
                <i className={css.link} />
                <div className={css.step}>
                  <small>The exact sentence</small>
                  <span>
                    &ldquo;Home working led to a <mark>13%</mark> performance increase&rdquo;
                  </span>
                </div>
                <i className={css.link} />
                <div className={css.step}>
                  <small>The paper</small>
                  <span>Bloom, Liang, Roberts &amp; Ying, Quarterly Journal of Economics, 130(1)</span>
                </div>
                <i className={css.link} />
                <div className={css.step}>
                  <small>The registry</small>
                  <span>Crossref, 10.1093/qje/qju032. No retraction</span>
                </div>
              </div>
              <p className={css.say} aria-live="polite">
                {broke ? 'Disputed. The source says 13%, so the trail breaks here.' : 'Supported. The number and the direction hold, so the trail runs unbroken to the registry.'}
              </p>
            </div>
          </div>
        </section>
        <div className={css.gap} />

        <section className={css.ch} ref={set(4)}>
          <div className={css.gut}>
            <div className={css.col}>
              <h2>You hold the dial.</h2>
              <p>Every assessment has its own AI rule. Set it once, and the agents that are not allowed go dark, at the server as well as on screen.</p>
              <div className={css.dial} role="group" aria-label="AI permission level">
                {AI_LEVELS.map((l) => (
                  <button key={l.level} type="button" aria-pressed={level === l.level} onClick={() => setLevel(l.level)}>
                    <b>{l.level}</b>
                    <span>{l.name}</span>
                  </button>
                ))}
              </div>
              <ul className={css.agents}>
                {[...AGENTS].sort((a, b) => Number(a.kind === 'ai') - Number(b.kind === 'ai')).map((a) => {
                  const on = a.kind === 'code' || level >= a.minLevel;
                  return (
                    <li key={a.id} data-kind={a.kind} data-on={on}>
                      <i aria-hidden="true" />
                      {a.name}
                      {!on && ' (locked)'}
                    </li>
                  );
                })}
              </ul>
              <p className={css.small}>Square lights are plain code and always on. Round lights are AI. No level writes your assignment.</p>
            </div>
          </div>
        </section>
        <div className={css.gap} />

        <section className={css.day} ref={set(5)}>
          <div className={css.gut}>
            <div className={css.dayHead}>
              <h2>Lights on. Get to work.</h2>
              <p>Find real papers, keep the ones you want, trace each claim to its sentence, and export a reference list you can defend.</p>
              <div className="row">
                <Link to="/projects" className="btn main">
                  Start a project
                </Link>
                <Link to="/check" className="btn">
                  Check a reference list
                </Link>
              </div>
            </div>
            <div>
              <h2>What Paper Trail will not do</h2>
              <ul className={css.wont}>
                <li>
                  <b>Write your assignment</b>
                  <span>It finds, checks, challenges and formats. The sentences stay yours.</span>
                </li>
                <li>
                  <b>Call a source fake</b>
                  <span>It says where it looked and what it did not find. Books and regional journals are often not indexed.</span>
                </li>
                <li>
                  <b>Show green without proof</b>
                  <span>If a check could not run, the label says so. A network error never looks like a pass.</span>
                </li>
                <li>
                  <b>Let AI approve anything</b>
                  <span>Every gate belongs to you, and keeping a flagged source needs a written reason.</span>
                </li>
              </ul>
            </div>
            <p className={css.foot}>
              Team 1, SP Jain AI Club Hackathon 2026. Built with AI assistance; the prompt log is in the repository. Your library stays in this browser.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
