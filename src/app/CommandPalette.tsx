import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cleanTitle, norm } from '@/core/verify/normalise';
import { db } from '@/store/db';
import css from './CommandPalette.module.css';
import { go } from './router';

interface Item {
  key: string;
  label: string;
  kind: string;
  to: string;
}

const PAGES: Item[] = [
  { key: 'p-desk', label: 'Home', kind: 'Page', to: '/home' },
  { key: 'p-check', label: 'Check references', kind: 'Page', to: '/check' },
  { key: 'p-projects', label: 'Projects', kind: 'Page', to: '/projects' },
  { key: 'p-lab', label: 'Integrity Lab', kind: 'Page', to: '/lab' },
  { key: 'p-rules', label: 'House rules', kind: 'Page', to: '/rules' },
  { key: 'p-account', label: 'Account', kind: 'Page', to: '/account' },
  { key: 'p-home', label: 'Start page', kind: 'Page', to: '/' },
];
const STEPS = ['Team', 'Plan', 'Find', 'Library', 'Read', 'Map', 'Evidence', 'Challenge', 'Ask', 'Write', 'Review', 'Export'];

export function CommandPalette() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Item[]>(PAGES);
  const [at, setAt] = useState(0);
  const listId = useId();

  useEffect(() => {
    const open = async () => {
      if (dialog.current?.open) return;
      setQ('');
      setAt(0);
      dialog.current?.showModal();
      const [projects, sources] = await Promise.all([db.projects.orderBy('createdAt').reverse().limit(50).toArray(), db.sources.limit(500).toArray()]);
      const here = window.location.hash.match(/^#\/p\/([^/]+)/)?.[1];
      setItems([
        ...(here ? STEPS.map((s) => ({ key: `s-${s}`, label: s, kind: 'This project', to: `/p/${here}/${s.toLowerCase()}` })) : []),
        ...PAGES,
        ...projects.map((p) => ({ key: p.id, label: p.question, kind: 'Project', to: `/p/${p.id}/${p.plan?.approvedAt ? 'library' : 'plan'}` })),
        ...sources.map((s) => ({ key: s.id, label: cleanTitle(s.record?.title ?? s.raw?.title ?? s.raw?.raw ?? 'Untitled'), kind: 'Source', to: `/p/${s.projectId}/library` })),
      ]);
    };
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (dialog.current?.open) dialog.current.close();
        else void open();
      }
    };
    const ev = () => void open();
    window.addEventListener('keydown', key);
    window.addEventListener('pt:palette', ev);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('pt:palette', ev);
    };
  }, []);

  const hits = useMemo(() => {
    const words = norm(q).split(' ').filter(Boolean);
    return items.filter((i) => words.every((w) => norm(`${i.label} ${i.kind}`).includes(w))).slice(0, 12);
  }, [q, items]);
  const pick = (i: Item | undefined) => {
    if (!i) return;
    dialog.current?.close();
    go(i.to);
  };

  return (
    <dialog ref={dialog} className={css.dialog} aria-label="Go to" onClick={(e) => e.target === dialog.current && dialog.current.close()}>
      <div className={css.in}>
        <input
          className={css.input}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={hits[at] ? `${listId}-${at}` : undefined}
          aria-label="Find a page, project or source"
          placeholder="Find a page, project or source"
          value={q}
          autoFocus
          onChange={(e) => {
            setQ(e.target.value);
            setAt(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setAt((c) => (hits.length ? (c + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length : 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              pick(hits[at]);
            }
          }}
        />
        <ul id={listId} role="listbox" aria-label="Results" className={css.list}>
          {hits.map((h, i) => (
            <li key={h.key} id={`${listId}-${i}`} role="option" aria-selected={i === at} onMouseMove={() => setAt(i)} onClick={() => pick(h)}>
              <span>{h.label}</span>
              <small>{h.kind}</small>
            </li>
          ))}
        </ul>
        {hits.length === 0 && <p className={css.none}>Nothing matches that.</p>}
      </div>
    </dialog>
  );
}
