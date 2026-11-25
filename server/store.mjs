// Where locked libraries are kept. Everything in here was encrypted in the student's browser first.
// SQLite when Node has it (22.13 or newer), one file per account when it does not. Both behave the same.
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';

const FIELDS = ['id', 'salt', 'iterations', 'authSalt', 'authHash', 'epoch', 'rev', 'sealed', 'updated', 'created', 'fails', 'lockedUntil'];

function sqliteStore(DatabaseSync, dir) {
  const d = new DatabaseSync(join(dir, 'paper-trail.db'));
  d.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 3000;');
  d.exec('CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, salt TEXT NOT NULL, iterations INTEGER NOT NULL, authSalt TEXT NOT NULL, authHash TEXT NOT NULL, epoch INTEGER NOT NULL, rev INTEGER NOT NULL, sealed TEXT NOT NULL, updated TEXT NOT NULL, created TEXT NOT NULL, fails INTEGER NOT NULL, lockedUntil INTEGER NOT NULL) STRICT');
  const get = d.prepare('SELECT * FROM accounts WHERE id = ?');
  const add = d.prepare(`INSERT INTO accounts (${FIELDS.join(', ')}) VALUES (${FIELDS.map(() => '?').join(', ')}) ON CONFLICT(id) DO NOTHING`);
  const del = d.prepare('DELETE FROM accounts WHERE id = ?');
  const count = d.prepare('SELECT count(*) AS n FROM accounts');
  return {
    kind: 'sqlite',
    get: (id) => {
      const r = get.get(id);
      return r ? { ...r } : null;
    },
    add: (row) => add.run(...FIELDS.map((f) => row[f])).changes === 1,
    /** Changes a row only while it still has the revision the caller saw. */
    update: (id, patch, whenRev) => {
      const keys = Object.keys(patch).filter((k) => FIELDS.includes(k) && k !== 'id');
      const sql = `UPDATE accounts SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?${whenRev === undefined ? '' : ' AND rev = ?'}`;
      return d.prepare(sql).run(...keys.map((k) => patch[k]), id, ...(whenRev === undefined ? [] : [whenRev])).changes === 1;
    },
    del: (id) => del.run(id).changes === 1,
    count: () => Number(count.get().n),
    close: () => d.close(),
  };
}

function fileStore(dir) {
  const at = join(dir, 'accounts');
  mkdirSync(at, { recursive: true });
  const path = (id) => join(at, `${id}.json`);
  const read = (id) => (existsSync(path(id)) ? JSON.parse(readFileSync(path(id), 'utf8')) : null);
  const write = (row) => {
    // Written beside, then renamed, so a power cut leaves the old copy whole.
    const tmp = `${path(row.id)}.${randomBytes(4).toString('hex')}`;
    writeFileSync(tmp, JSON.stringify(row), { mode: 0o600 });
    renameSync(tmp, path(row.id));
  };
  return {
    kind: 'files',
    get: read,
    add: (row) => {
      if (existsSync(path(row.id))) return false;
      write(row);
      return true;
    },
    update: (id, patch, whenRev) => {
      const row = read(id);
      if (!row || (whenRev !== undefined && row.rev !== whenRev)) return false;
      write({ ...row, ...patch, id });
      return true;
    },
    del: (id) => {
      if (!existsSync(path(id))) return false;
      rmSync(path(id));
      return true;
    },
    count: () => readdirSync(at).filter((f) => f.endsWith('.json')).length,
    close: () => undefined,
  };
}

let opened = null;

/** Opens the store once. Null when this host has no disk to write to, and then the site saves in the browser only. */
export async function openStore(dir = resolve(process.env.DATA_DIR ?? 'data'), prefer = process.env.STORE) {
  if (opened?.dir === dir) return opened.store;
  try {
    mkdirSync(dir, { recursive: true });
    let store = null;
    if (prefer !== 'files') {
      try {
        const { DatabaseSync } = await import('node:sqlite');
        store = sqliteStore(DatabaseSync, dir);
      } catch {
        store = null;
      }
    }
    store ??= fileStore(dir);
    opened = { dir, store: Object.assign(store, { secret: secretIn(dir) }) };
  } catch {
    opened = { dir, store: null };
  }
  return opened.store;
}

/** For tests. */
export function closeStore() {
  opened?.store?.close();
  opened = null;
}

/** Signs session cookies. Made once and kept beside the data, unless the host provides one. */
function secretIn(dir) {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) return process.env.SESSION_SECRET;
  const f = join(dir, 'session-secret');
  if (existsSync(f)) return readFileSync(f, 'utf8').trim();
  const s = randomBytes(32).toString('hex');
  writeFileSync(f, s, { mode: 0o600 });
  try {
    chmodSync(f, 0o600);
  } catch {
    /* not every file system has modes */
  }
  return s;
}
