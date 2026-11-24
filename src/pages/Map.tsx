import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@/app/router';
import type { StepProps } from '@/app/ProjectShell';
import { balance } from '@/core/report/balance';
import { buildGraph, layout } from '@/map/graph';
import { db } from '@/store/db';
import css from './Map.module.css';

export function MapPage({ project }: StepProps) {
  const sources = useLiveQuery(() => db.sources.where('projectId').equals(project.id).toArray(), [project.id]);
  const graph = useMemo(() => buildGraph(sources ?? []), [sources]);
  const at = useMemo(() => layout(graph), [graph]);
  const bal = useMemo(() => balance(sources ?? []), [sources]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<Record<string, HTMLElement | null>>({});
  const [picked, setPicked] = useState('');
  const [gl, setGl] = useState(true);
  const pickedRef = useRef('');
  pickedRef.current = picked;

  useEffect(() => {
    if (!canvas.current || graph.nodes.length === 0) return;
    let stop: (() => void) | null = null;
    let gone = false;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = () =>
      void import('@/map/scene')
        .then(({ startMap }) => {
          if (gone || !canvas.current) return;
          stop?.();
          const cs = getComputedStyle(document.documentElement);
          const c = (n: string) => cs.getPropertyValue(n).trim();
          stop = startMap({
            canvas: canvas.current,
            graph,
            at,
            still,
            colors: { ok: c('--ok'), flag: c('--gate'), cite: c('--accent'), share: c('--soft') },
            onPick: setPicked,
            onLabels: (p) => {
              // Labels never cover each other: the first one in a spot wins, the picked one always shows.
              const taken: { x: number; y: number }[] = [];
              for (const l of [...p].sort((a, b) => Number(b.id === pickedRef.current) - Number(a.id === pickedRef.current))) {
                const el = labels.current[l.id];
                if (!el) continue;
                const free = !taken.some((t) => Math.abs(t.x - l.x) < 124 && Math.abs(t.y - l.y) < 20);
                if (free) taken.push(l);
                el.style.opacity = free ? '1' : '0';
                el.style.transform = `translate(${l.x.toFixed(1)}px, ${(l.y + 12).toFixed(1)}px) translateX(-50%)`;
              }
            },
          });
          if (!stop) setGl(false);
        })
        .catch(() => setGl(false));
    start();
    const mo = new MutationObserver(start);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      gone = true;
      mo.disconnect();
      stop?.();
    };
  }, [graph, at]);

  const name = (id: string) => graph.nodes.find((n) => n.id === id);
  const rows = graph.nodes.map((n) => ({
    n,
    cites: graph.cites.filter((c) => c.from === n.id).map((c) => name(c.to)!.who),
    by: graph.cites.filter((c) => c.to === n.id).map((c) => name(c.from)!.who),
    shared: graph.shared.filter((s) => s.a === n.id || s.b === n.id).map((s) => `${name(s.a === n.id ? s.b : s.a)!.who} (${s.count})`),
  }));
  const sel = rows.find((r) => r.n.id === picked);

  return (
    <>
      <div className="stack">
        <h1>Map</h1>
        <p className="soft">How your sources connect. A solid line means one cites the other. A faint line means they share references. Nothing else is drawn.</p>
      </div>
      {sources === undefined && <p className="soft">Opening your library…</p>}
      {sources && graph.nodes.length === 0 && (
        <p>
          Nothing to map yet. <Link to={`/p/${project.id}/find`}>Find sources</Link> first.
        </p>
      )}
      {graph.nodes.length > 0 && (
        <>
          {gl && (
            <div className={css.stage}>
              <canvas ref={canvas} className={css.canvas} aria-hidden="true" />
              {graph.nodes.map((n) => (
                <span key={n.id} ref={(el) => { labels.current[n.id] = el; }} className={css.label} data-on={picked === n.id} aria-hidden="true">
                  {n.who} {n.year ?? ''}
                </span>
              ))}
            </div>
          )}
          <p className="soft">
            {graph.cites.length} {graph.cites.length === 1 ? 'citation' : 'citations'} and {graph.shared.length} shared-reference {graph.shared.length === 1 ? 'link' : 'links'} between {graph.nodes.length} sources.
            {graph.noData > 0 && ` ${graph.noData} ${graph.noData === 1 ? 'has' : 'have'} no reference list in the registry, so missing lines there mean no data.`} {gl && 'Drag to turn. Hold Ctrl and scroll to zoom. Diamonds are flagged sources.'}
          </p>
          {sel && (
            <div className={`card ${css.sel}`} role="status">
              <strong>{sel.n.title}</strong>
              <span className="soft">
                {sel.n.who} · {sel.n.year ?? 'year not stated'} {sel.n.doi && (<a href={`https://doi.org/${sel.n.doi}`} target="_blank" rel="noreferrer">Open the source</a>)}
              </span>
            </div>
          )}
          <div className={css.scroll} tabIndex={0} role="region" aria-label="Connections table">
            <table className={css.table}>
              <caption className="sr">The same connections as a table</caption>
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Cites</th>
                  <th scope="col">Cited by</th>
                  <th scope="col">Shares references with</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.n.id} data-on={picked === r.n.id}>
                    <th scope="row">
                      <button type="button" className={css.pick} onClick={() => setPicked(r.n.id)} aria-pressed={picked === r.n.id}>
                        {r.n.title}
                      </button>
                      {r.n.flagged && <small> Flagged</small>}
                    </th>
                    <td>{r.cites.join(', ') || 'none here'}</td>
                    <td>{r.by.join(', ') || 'none here'}</td>
                    <td>{r.shared.join(', ') || 'none here'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section className="stack" aria-label="Source balance">
            <h2>Source balance</h2>
            <p>
              {bal.withRecord} of {bal.total} sources have a registry record.
              {bal.oldest && ` Published ${bal.oldest === bal.newest ? bal.oldest : `${bal.oldest} to ${bal.newest}`}.`} {bal.openAccess} free to read. {bal.preprints} preprints.
            </p>
            {bal.notes.length > 0 ? (
              <ul className={css.notes}>
                {bal.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : (
              <p className="soft">Nothing here looks one-sided by year, journal, author or type. We cannot see country, language or viewpoint.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}
