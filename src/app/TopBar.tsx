import { useEffect, useState } from 'react';
import { useSession } from '@/auth/accounts';
import css from './TopBar.module.css';
import { goBack, Link } from './router';

const NAV = [
  { to: '/home', key: 'home', label: 'Home' },
  { to: '/projects', key: 'projects', label: 'Projects' },
  { to: '/check', key: 'check', label: 'Check' },
  { to: '/lab', key: 'lab', label: 'Integrity Lab' },
  { to: '/rules', key: 'rules', label: 'House rules' },
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
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('pt-theme', theme);
    } catch {
      /* private window: the choice lasts for this visit */
    }
  }, [theme]);
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
        </nav>
        <button type="button" className={css.lamp} onClick={() => window.dispatchEvent(new Event('pt:palette'))}>
          Search <kbd>Ctrl K</kbd>
        </button>
        <button type="button" className={css.lamp} onClick={() => window.dispatchEvent(new Event('pt:tour'))}>
          Tour
        </button>
        <button type="button" className={css.lamp} aria-pressed={theme === 'dark'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? 'Lights on' : 'Lights off'}
        </button>
        <Link to={session.kind === 'account' ? '/account' : '/signin'} className={css.who} aria-current={section === 'account' || section === 'signin' ? 'page' : undefined}>
          {session.kind === 'account' ? session.name : session.kind === 'guest' ? 'Guest: sign in' : 'Sign in'}
        </Link>
      </div>
    </header>
  );
}
