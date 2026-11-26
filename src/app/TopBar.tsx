import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/auth/accounts';
import { SaveMark } from '@/auth/SaveMark';
import css from './TopBar.module.css';
import { goBack, Link } from './router';

const NAV = [
  { to: '/home', key: 'home', label: 'Home' },
  { to: '/projects', key: 'projects', label: 'Projects' },
  { to: '/check', key: 'check', label: 'Check' },
  { to: '/audit', key: 'audit', label: 'Audit' },
];
const MORE = [
  { to: '/guide', key: 'guide', label: 'How it works' },
  { to: '/lab', key: 'lab', label: 'Integrity Lab' },
  { to: '/rules', key: 'rules', label: 'House rules' },
  { to: '/guardrails', key: 'guardrails', label: 'Guardrails' },
];

const saved = (): 'light' | 'dark' => {
  try {
    return localStorage.getItem('pt-theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};

export function TopBar({ section }: { section: string }) {
  const [theme, setTheme] = useState(saved);
  const session = useSession();
  const more = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('pt-theme', theme);
    } catch {
      /* private window: the choice lasts for this visit */
    }
  }, [theme]);
  // The menu closes on a choice, a click elsewhere, or Escape.
  useEffect(() => {
    const shut = (e: Event) => {
      const el = more.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent) {
        if (e.key !== 'Escape') return;
        el.querySelector('summary')?.focus();
      } else if (e.target instanceof Node && el.contains(e.target)) return;
      el.open = false;
    };
    window.addEventListener('pointerdown', shut);
    window.addEventListener('keydown', shut);
    return () => {
      window.removeEventListener('pointerdown', shut);
      window.removeEventListener('keydown', shut);
    };
  }, []);
  const close = () => {
    if (more.current) more.current.open = false;
  };
  const inMore = MORE.some((m) => m.key === section);
  return (
    <header className={css.bar}>
      <div className={`wrap ${css.in}`}>
        <button type="button" className={css.back} onClick={goBack}>
          <span aria-hidden="true">←</span> Back
        </button>
        <Link to="/" className={css.mark}>
          Paper Trail
        </Link>
        <nav aria-label="Main" className={css.nav}>
          {NAV.map((n) => (
            <Link key={n.key} to={n.to} aria-current={section === n.key || (n.key === 'projects' && section === 'p') ? 'page' : undefined}>
              {n.label}
            </Link>
          ))}
          <details className={css.more} ref={more}>
            <summary data-on={inMore}>More</summary>
            <div className={css.menu}>
              {MORE.map((m) => (
                <Link key={m.key} to={m.to} aria-current={section === m.key ? 'page' : undefined} onClick={close}>
                  {m.label}
                </Link>
              ))}
              <button type="button" className={css.onPhone} onClick={() => { close(); window.dispatchEvent(new Event('pt:palette')); }}>
                Search
              </button>
              <button type="button" onClick={() => { close(); window.dispatchEvent(new Event('pt:tour')); }}>
                Take the tour
              </button>
              <button type="button" aria-pressed={theme === 'dark'} onClick={() => { close(); setTheme(theme === 'dark' ? 'light' : 'dark'); }}>
                {theme === 'dark' ? 'Lights on' : 'Lights off'}
              </button>
            </div>
          </details>
        </nav>
        <button type="button" className={css.lamp} onClick={() => window.dispatchEvent(new Event('pt:palette'))}>
          Search
        </button>
        <Link to={session.kind === 'account' ? '/account' : '/signin'} className={css.who} aria-current={section === 'account' || section === 'signin' ? 'page' : undefined}>
          {session.kind === 'account' ? session.name : session.kind === 'guest' ? 'Guest: sign in' : 'Sign in'}
        </Link>
        <SaveMark />
      </div>
    </header>
  );
}
