import { useEffect, useState } from 'react';
import { go } from '@/app/router';
import { accountNames, continueAsGuest, guestHasWork, MIN_PASSPHRASE, signIn, signUp, signUpProblems } from '@/auth/accounts';
import { canSave } from '@/auth/cloud';
import css from './SignIn.module.css';

/** The page after signing in. Only our own pages, so a link can never send someone elsewhere. */
export const nextFrom = (path: string): string => {
  let n = '';
  try {
    n = decodeURIComponent(path.split('?next=')[1] ?? '');
  } catch {
    /* a broken address goes home */
  }
  return /^\/(home|projects|account|p\/[\w-]+(\/[a-z]+)?)$/.test(n) ? n : '/home';
};

export function SignIn({ path }: { path: string }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [bring, setBring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [names, setNames] = useState<string[]>([]);
  const [guestWork, setGuestWork] = useState(false);
  const [saves, setSaves] = useState<boolean | null>(null);
  const next = nextFrom(path);

  useEffect(() => {
    void accountNames()
      .then((n) => {
        setNames(n);
        if (!n.length) setMode('up');
      })
      .catch(() => setError('This browser is blocking storage, so accounts cannot work here. You can still check references.'));
    void canSave().then(setSaves, () => undefined);
    void guestHasWork().then(setGuestWork, () => undefined);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (mode === 'up') {
      const bad = signUpProblems(name, pass, again);
      if (bad.length) {
        setError(bad[0]!);
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === 'in') await signIn(name, pass);
      else await signUp(name, pass, again, guestWork && bring);
      go(next);
    } catch (x) {
      setError(x instanceof Error ? x.message : 'That did not work.');
      setPass('');
      setAgain('');
    }
    setBusy(false);
  }

  return (
    <main className={`wrap page ${css.page}`} id="main" tabIndex={-1}>
      <section className={css.side}>
        <h1>{mode === 'in' ? 'Sign in' : 'Create your account'}</h1>
        <p>
          {saves === false
            ? 'An account keeps your work locked on this device. This copy of the site has no server that can save it for another computer.'
            : saves
              ? 'An account saves your work, so you can open it on another computer.'
              : 'An account keeps your work locked with your passphrase.'}
        </p>
        <ul>
          <li>Your library is locked with your passphrase before it is saved. We cannot read it.</li>
          <li>Each person on a shared laptop gets their own library.</li>
          <li>Two hours without use signs you out.</li>
        </ul>
        <p className="soft">We cannot reset a passphrase, because we never have it. Keep a backup.</p>
      </section>
      <div className={css.forms}>
        <div className={css.tabs} role="group" aria-label="Sign in or create an account">
          <button type="button" aria-pressed={mode === 'in'} onClick={() => { setMode('in'); setError(''); }}>
            Sign in
          </button>
          <button type="button" aria-pressed={mode === 'up'} onClick={() => { setMode('up'); setError(''); }}>
            Create account
          </button>
        </div>
        <form className={`card ${css.form}`} onSubmit={(e) => void submit(e)} noValidate>
          <label>
            <span>Name</span>
            <input className="field" autoComplete="username" list="known-names" value={name} onChange={(e) => setName(e.target.value)} />
            <datalist id="known-names">
              {names.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
          <label>
            <span>Passphrase{mode === 'up' ? `, at least ${MIN_PASSPHRASE} characters` : ''}</span>
            <input className="field" type={show ? 'text' : 'password'} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={pass} onChange={(e) => setPass(e.target.value)} />
          </label>
          {mode === 'up' && (
            <label>
              <span>The same passphrase again</span>
              <input className="field" type={show ? 'text' : 'password'} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
            </label>
          )}
          <label className={css.tick}>
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> <span>Show passphrase</span>
          </label>
          {mode === 'up' && guestWork && (
            <label className={css.tick}>
              <input type="checkbox" checked={bring} onChange={(e) => setBring(e.target.checked)} /> <span>Bring my guest projects into this account</span>
            </label>
          )}
          {error && (
            <p role="alert" className={css.error}>
              {error}
            </p>
          )}
          <button className="btn main" type="submit" disabled={busy || !name.trim() || !pass}>
            {busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <div className={css.guest}>
          <p>Just looking? A guest library stays in this browser, without a passphrase.</p>
          <button
            className="btn"
            type="button"
            onClick={() => {
              continueAsGuest();
              go(next);
            }}
          >
            Continue as guest
          </button>
        </div>
      </div>
    </main>
  );
}
