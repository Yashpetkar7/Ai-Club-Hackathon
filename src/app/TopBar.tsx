import { useEffect, useState } from 'react';
import css from './TopBar.module.css';
import { Link } from './router';

const NAV = [
  { to: '/check', key: 'check', label: 'Check' },
  { to: '/projects', key: 'projects', label: 'Projects' },
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
        <button type="button" className={css.lamp} aria-pressed={theme === 'dark'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? 'Lights on' : 'Lights off'}
        </button>
      </div>
    </header>
  );
}
