import { Component, lazy, Suspense, useEffect, useRef, type ReactNode } from 'react';
import { resume, touch, useSession } from '@/auth/accounts';
import { forgetTeam } from '@/agents/team';
import { Check } from '@/pages/Check';
import { Home } from '@/pages/Home';
import { Projects } from '@/pages/Projects';
import { ProjectShell } from './ProjectShell';
import { CommandPalette } from './CommandPalette';
import { useRoute } from './router';
import { Tour } from './Tour';
import { TopBar } from './TopBar';

const Landing = lazy(() => import('@/landing/Landing').then((m) => ({ default: m.Landing })));
const Lab = lazy(() => import('@/pages/Lab').then((m) => ({ default: m.Lab })));
const SignIn = lazy(() => import('@/pages/SignIn').then((m) => ({ default: m.SignIn })));
const Account = lazy(() => import('@/pages/Account').then((m) => ({ default: m.Account })));
const Guide = lazy(() => import('@/pages/Guide').then((m) => ({ default: m.Guide })));
const Rules = lazy(() => import('@/pages/Rules').then((m) => ({ default: m.Rules })));
const Data = lazy(() => import('@/pages/Data').then((m) => ({ default: m.Data })));

class Boundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="wrap page" role="alert">
        <h1>This page stopped working</h1>
        <p className="soft">Your library is safe in this browser. Reload the page. If it happens again, tell us what you clicked.</p>
        <p className="mono">{this.state.error.message}</p>
        <button className="btn main" type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </main>
    );
  }
}

export function App() {
  const { path, parts } = useRoute();
  const first = useRef(true);
  const section = parts[0] ?? '';
  const session = useSession();
  const who = session.kind === 'account' ? session.id : session.kind;

  useEffect(() => {
    void resume();
    const names = ['pointerdown', 'keydown'] as const;
    names.forEach((n) => window.addEventListener(n, touch, { passive: true }));
    return () => names.forEach((n) => window.removeEventListener(n, touch));
  }, []);
  // Nothing found for one person may show for the next.
  useEffect(() => forgetTeam, [who]);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (first.current) {
      first.current = false;
      return;
    }
    const h = document.querySelector<HTMLElement>('main h1');
    if (h) {
      h.tabIndex = -1;
      h.focus({ preventScroll: true });
    }
  }, [path]);

  const PRIVATE = ['home', 'projects', 'p', 'account'];
  let page: ReactNode;
  if (session.kind === 'loading') page = <main className="wrap page" aria-busy="true"><p className="soft">Opening…</p></main>;
  else if (section === 'signin' || (PRIVATE.includes(section) && session.kind === 'none')) page = <SignIn path={section === 'signin' ? path : `/signin?next=${encodeURIComponent(path)}`} />;
  else if (section === '') page = <Landing />;
  else if (section === 'home') page = <Home />;
  else if (section === 'account') page = <Account />;
  else if (section === 'check') page = <Check />;
  else if (section === 'projects') page = <Projects />;
  else if (section === 'p' && parts[1]) page = <ProjectShell projectId={parts[1]} step={parts[2] ?? 'plan'} />;
  else if (section === 'lab') page = <Lab />;
  else if (section === 'rules') page = <Rules />;
  else if (section === 'guide') page = <Guide />;
  else if (section === 'data') page = <Data />;
  else
    page = (
      <main className="wrap page">
        <h1>Nothing is here</h1>
        <p>
          That address does not exist. <a href="#/">Go to the start</a> or <a href="#/check">check a reference</a>.
        </p>
      </main>
    );

  return (
    <>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.querySelector<HTMLElement>('main')?.focus(); }}>
        Skip to content
      </a>
      {section !== '' && <TopBar section={section} />}
      <CommandPalette />
      <Tour />
      <Boundary resetKey={path}>
        <Suspense key={who} fallback={<main className="wrap page" aria-busy="true"><p className="soft">Loading…</p></main>}>{page}</Suspense>
      </Boundary>
    </>
  );
}
