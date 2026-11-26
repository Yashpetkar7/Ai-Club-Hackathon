import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { z } from 'zod';
import { useRoute } from '@/app/router';
import { postAi } from '@/core/aiClient';
import { clearOwnerKey, isOwnerKeyShape, onOwnerKey, ownerKeySnapshot, setOwnerKey } from '@/core/ownerKey';
import css from './OwnerKey.module.css';

/**
 * Hidden owner panel. Shown only at #/lab?owner and linked from nowhere: no nav, palette, Guide, Tour or page.
 * The key itself is never shown, logged or put in a message. Only its last 4 characters are shown.
 */
export function OwnerKey() {
  const { path } = useRoute();
  if (!new URLSearchParams(path.split('?')[1] ?? '').has('owner')) return null;
  return <OwnerPanel />;
}

const Answer = z.object({ ok: z.boolean(), model: z.string().optional(), reason: z.string().optional(), owner: z.boolean().optional() });
const TEST_QUESTION = 'How can a student check that a journal article is real?';

function said(status: number, body: unknown): { bad: boolean; text: string } {
  const a = Answer.safeParse(body);
  if (!a.success) return { bad: true, text: `The server gave an answer we could not read (HTTP ${status}). Try again in a minute.` };
  const model = (a.data.model ?? 'an unnamed model').slice(0, 80);
  if (a.data.ok && a.data.owner) return { bad: false, text: `The key works. Groq answered with ${model}.` };
  if (a.data.ok) return { bad: true, text: `Your key gave no answer this time, so the server's own key answered with ${model}. Try again in a minute.` };
  switch (a.data.reason) {
    case 'key-rejected':
      return { bad: true, text: 'Groq refused this key. Check it, or forget it and paste a new one.' };
    case 'busy':
      return { bad: true, text: 'Too many AI requests from this network. Try again in a few minutes.' };
    case 'no-key':
      return { bad: true, text: 'The server did not receive a usable key. Save the key again.' };
    case 'no answer':
      return { bad: true, text: 'Groq gave no usable answer. Its free tier allows about 30 requests a minute, so try again shortly.' };
    default:
      return { bad: true, text: `The test did not work (HTTP ${status}). Try again in a minute.` };
  }
}

function OwnerPanel() {
  const saved = useSyncExternalStore(onOwnerKey, ownerKeySnapshot, () => '');
  const [draft, setDraft] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ bad: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const input = useRef<HTMLInputElement>(null);
  const testButton = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const [where, last4] = saved ? saved.split(':') : [null, null];

  useEffect(() => {
    mounted.current = true;
    const changed = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', changed);
    window.addEventListener('offline', changed);
    return () => {
      mounted.current = false;
      window.removeEventListener('online', changed);
      window.removeEventListener('offline', changed);
    };
  }, []);

  function save(e: FormEvent) {
    e.preventDefault();
    setResult(null);
    const key = draft.trim();
    if (!isOwnerKeyShape(key)) {
      setError('That does not look like a Groq key. A Groq key starts with gsk_ and is followed by letters and digits only.');
      input.current?.focus();
      return;
    }
    if (!setOwnerKey(key, remember)) {
      setError('This browser would not store the key. Private windows and blocked site data stop it.');
      return;
    }
    setDraft('');
    setError('');
    setResult({ bad: false, text: remember ? 'Saved on this device. It stays until you forget it.' : 'Saved for this tab. It goes when you close the tab.' });
    // The Save button is disabled once the field is empty, so focus moves on to the next step.
    requestAnimationFrame(() => testButton.current?.focus());
  }

  async function test() {
    if (testing) return;
    setError('');
    setResult(null);
    setTesting(true);
    try {
      const r = await postAi({ task: 'plan', level: 1, input: { question: TEST_QUESTION } });
      const body: unknown = await r.json().catch(() => null);
      if (mounted.current) setResult(said(r.status, body));
    } catch {
      if (mounted.current) setResult({ bad: true, text: navigator.onLine === false ? 'You are offline. Connect, then test the key.' : 'This site’s server did not answer. Try again in a minute.' });
    } finally {
      if (mounted.current) setTesting(false);
    }
  }

  function forget() {
    const ok = clearOwnerKey();
    setResult(ok ? { bad: false, text: 'The key is forgotten in this browser.' } : null);
    setError(ok ? '' : 'This browser would not remove the key. Clear this site’s data in the browser settings.');
    input.current?.focus();
  }

  return (
    <section className={`card ${css.panel}`} aria-labelledby="owner-key-heading">
      <h2 id="owner-key-heading">Owner AI key</h2>
      <p className="soft">
        Only for the person who runs this site. A Groq key saved here stays in this tab, or on this device if you tick the box. It goes only to this site’s own server, with each AI request, and the server passes it to Groq. It is never put in a library, the log, an export or a link.
      </p>
      <p className={css.state}>{saved ? `A key ending in ${last4} is saved ${where === 'device' ? 'on this device' : 'for this tab'}.` : 'No key is saved in this browser.'}</p>
      <form className="stack" autoComplete="off" onSubmit={save}>
        <label className="stack">
          <strong>Groq API key</strong>
          <input
            ref={input}
            className="field"
            type="password"
            name="owner-ai-key"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="none"
            aria-describedby="owner-key-help"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <p id="owner-key-help" className="soft">
          Starts with gsk_. Saving replaces any key saved before.
        </p>
        <label className={css.check}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> <span>Remember on this device</span>
        </label>
        <div className="row">
          <button className="btn main" type="submit" disabled={!draft.trim()}>
            {remember ? 'Save on this device' : 'Save for this tab'}
          </button>
          <button ref={testButton} className="btn" type="button" disabled={!saved || !online} aria-disabled={testing || undefined} onClick={() => void test()}>
            {testing ? 'Testing…' : 'Test the key'}
          </button>
          <button className="btn quiet" type="button" disabled={!saved} onClick={forget}>
            Forget the key
          </button>
        </div>
      </form>
      {!online && <p className={css.note}>Your browser reports that it is offline. You can save or forget a key; testing it needs a connection.</p>}
      {error && (
        <p role="alert" className={css.error}>
          {error}
        </p>
      )}
      <p role="status" aria-live="polite" className={result?.bad ? css.error : css.result}>
        {testing ? 'Asking Groq through this site’s server…' : (result?.text ?? '')}
      </p>
    </section>
  );
}
