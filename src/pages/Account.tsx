import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { go, Link } from '@/app/router';
import { changePassphrase, deleteAccount, signOut, useSession } from '@/auth/accounts';
import { makeBackup, readBackup, restore } from '@/auth/vault';
import { saveFile } from '@/core/cite/save';
import { db } from '@/store/db';
import css from './Account.module.css';

const many = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;

export function Account() {
  const session = useSession();
  const count = useLiveQuery(async () => ({ projects: await db.projects.count(), sources: await db.sources.count(), claims: await db.claims.count() }), []);
  const isAccount = session.kind === 'account';
  return (
    <main className={`wrap page ${css.page}`} id="main" tabIndex={-1}>
      <div className="stack">
        <h1>{isAccount ? session.name : 'Guest'}</h1>
        <p className="soft">
          {isAccount ? `Account on this device since ${new Date(session.since).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}. ` : 'You are using the guest library. Anyone at this browser can open it. '}
          {count ? `${many(count.projects, 'project')}, ${many(count.sources, 'source')}, ${many(count.claims, 'claim')}.` : ''}
        </p>
        <div className="row">
          {isAccount ? (
            <SignOutButton />
          ) : (
            <Link to="/signin" className="btn main">
              Create an account or sign in
            </Link>
          )}
        </div>
      </div>
      <Backup />
      {isAccount && <Change />}
      {isAccount && <Remove />}
    </main>
  );
}

function SignOutButton() {
  const [error, setError] = useState('');
  return (
    <>
      <button
        className="btn main"
        type="button"
        onClick={() => {
          setError('');
          void signOut().then(
            () => go('/signin'),
            (e: Error) => setError(e.message),
          );
        }}
      >
        Sign out and lock
      </button>
      {error && (
        <p role="alert" className={css.error}>
          {error}
        </p>
      )}
    </>
  );
}

/** One small form with passphrase boxes, used four times below. */
function Form({ title, help, fields, button, onDone, danger }: { title: string; help: string; fields: string[]; button: string; onDone: (v: string[]) => Promise<string>; danger?: boolean }) {
  const [v, setV] = useState<string[]>(fields.map(() => ''));
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');
  const [error, setError] = useState('');
  return (
    <form
      className={css.box}
      data-danger={danger}
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        setSaid('');
        void onDone(v)
          .then(setSaid, (x: Error) => setError(x.message))
          .finally(() => {
            setBusy(false);
            setV(fields.map(() => ''));
          });
      }}
    >
      <h2>{title}</h2>
      <p className="soft">{help}</p>
      {fields.map((f, i) => (
        <label key={f}>
          <span>{f}</span>
          <input className="field" type="password" autoComplete="off" value={v[i]} onChange={(e) => setV((c) => c.map((x, k) => (k === i ? e.target.value : x)))} />
        </label>
      ))}
      <button className="btn" type="submit" disabled={busy || v.some((x) => !x)}>
        {busy ? 'One moment…' : button}
      </button>
      <p role="status" className="soft">
        {said}
      </p>
      {error && (
        <p role="alert" className={css.error}>
          {error}
        </p>
      )}
    </form>
  );
}

function Backup() {
  const [file, setFile] = useState<File | null>(null);
  const [sure, setSure] = useState(false);
  return (
    <div className={css.two}>
      <Form
        title="Download a backup"
        help="One encrypted file with everything in this library. It opens only with the passphrase you choose here."
        fields={['Passphrase for this file']}
        button="Download backup"
        onDone={async ([p]) => {
          if (p!.length < 10) throw new Error('Use at least 10 characters.');
          saveFile('paper-trail-backup.json', JSON.stringify(await makeBackup(db, p!)), 'application/json');
          return 'Backup ready. Without its passphrase nobody can open it, including us.';
        }}
      />
      <div className={css.stackbox}>
        <label className={css.file}>
          <span>Backup file</span>
          <input type="file" accept="application/json,.json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <label className={css.tick}>
          <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} /> <span>Replace what is in this library now</span>
        </label>
        <Form
          title="Open a backup"
          help="Choose the file above, tick the box, and type the passphrase it was made with."
          fields={['Passphrase of the file']}
          button="Open backup"
          onDone={async ([p]) => {
            if (!file) throw new Error('Choose a backup file first.');
            if (!sure) throw new Error('Tick the box first. Opening a backup replaces this library.');
            if (file.size > 60_000_000) throw new Error('That file is too large to be a Paper Trail backup.');
            await restore(db, await readBackup(await file.text(), p!));
            setSure(false);
            return 'Backup opened. Your projects are back.';
          }}
        />
      </div>
    </div>
  );
}

function Change() {
  return (
    <Form
      title="Change your passphrase"
      help="Your library is locked with the new one from now on."
      fields={['Passphrase now', 'New passphrase', 'New passphrase again']}
      button="Change passphrase"
      onDone={async ([a, b, c]) => {
        await changePassphrase(a!, b!, c!);
        return 'Passphrase changed.';
      }}
    />
  );
}

function Remove() {
  return (
    <Form
      title="Delete this account"
      help="Removes your account and every project, source, claim, draft and log entry in it. Nobody else has a copy, so it cannot be undone."
      fields={['Type your passphrase to delete']}
      button="Delete my account"
      danger
      onDone={async ([p]) => {
        await deleteAccount(p!);
        go('/signin');
        return 'Deleted.';
      }}
    />
  );
}
