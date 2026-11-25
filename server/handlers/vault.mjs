// Saves locked libraries. The passphrase and the key never reach this file: the browser sends a proof of the
// passphrase (hashed again here) and a library it has already encrypted. The server cannot open what it keeps.
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { tooMany } from '../guard.mjs';
import { openStore } from '../store.mjs';

const ID = /^[a-f0-9]{64}$/;
/** Base64 and nothing else. A loop, because a pattern runs out of stack on a library of several megabytes. */
function isB64(s, max) {
  if (typeof s !== 'string' || s.length < 8 || s.length > max) return false;
  let n = s.length;
  if (s[n - 1] === '=') n--;
  if (s[n - 1] === '=') n--;
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 43 || c === 47)) return false;
  }
  return true;
}
export const MAX_SEALED = 8_000_000;
const MAX_ACCOUNTS = 5000;
const MAX_FAILS = 5;
const LOCK_MS = 60_000;
const SESSION_S = 12 * 60 * 60;

const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'cache-control': 'no-store', ...headers } });
const no = (status, reason) => json({ ok: false, reason }, status);

const hash = (proof, salt) => new Promise((ok, bad) => scrypt(proof, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? bad(e) : ok(k))));
const same = (a, b) => a.length === b.length && timingSafeEqual(a, b);

const sign = (secret, body) => createHmac('sha256', secret).update(body).digest('hex');
function cookie(store, row, https, now = Date.now()) {
  const body = `${row.id}.${row.epoch}.${Math.floor(now / 1000) + SESSION_S}`;
  return `pt_sid=${body}.${sign(store.secret, body)}; Path=/api/vault; HttpOnly; SameSite=Strict; Max-Age=${SESSION_S}${https ? '; Secure' : ''}`;
}
/** The account a valid cookie belongs to. A changed passphrase raises the epoch, which ends older sessions. */
function whose(store, req, now = Date.now()) {
  const m = (req.headers.get('cookie') ?? '').match(/(?:^|;\s*)pt_sid=([a-f0-9]{64})\.(\d{1,9})\.(\d{1,12})\.([a-f0-9]{64})(?:;|$)/);
  if (!m) return null;
  const good = sign(store.secret, `${m[1]}.${m[2]}.${m[3]}`);
  if (!same(Buffer.from(good), Buffer.from(m[4])) || Number(m[3]) * 1000 < now) return null;
  const row = store.get(m[1]);
  return row && row.epoch === Number(m[2]) ? row : null;
}

const okSealed = (s) => !!s && typeof s === 'object' && isB64(s.iv, 40) && isB64(s.data, MAX_SEALED) && (s.z === 0 || s.z === 1);
const okParams = (b) => isB64(b.salt, 64) && Number.isInteger(b.iterations) && b.iterations >= 100_000 && b.iterations <= 2_000_000;
const okProof = (p) => isB64(p, 100);
const pickSealed = (s) => JSON.stringify({ iv: s.iv, data: s.data, z: s.z });

/** True when the proof is right. Counts wrong tries and locks the account for a minute after five. */
async function prove(store, row, proof) {
  if (!row) {
    // Same work for a name that does not exist, so the answer takes as long.
    await hash(proof, 'nobody');
    return 'no';
  }
  if (row.lockedUntil > Date.now()) return 'locked';
  if (same(await hash(proof, row.authSalt), Buffer.from(row.authHash, 'hex'))) {
    if (row.fails) store.update(row.id, { fails: 0, lockedUntil: 0 });
    return 'yes';
  }
  const fails = row.fails + 1;
  store.update(row.id, fails >= MAX_FAILS ? { fails: 0, lockedUntil: Date.now() + LOCK_MS } : { fails });
  return fails >= MAX_FAILS ? 'locked' : 'no';
}
const refuse = (why) => (why === 'locked' ? no(429, 'locked') : no(401, 'no match'));

const TASKS = {
  /** How to stretch the passphrase. An unknown name gets a steady made-up answer, so names cannot be tested here. */
  async start(store, b) {
    const row = store.get(b.id);
    if (row) return json({ ok: true, salt: row.salt, iterations: row.iterations });
    return json({ ok: true, salt: createHmac('sha256', store.secret).update(`salt|${b.id}`).digest().subarray(0, 16).toString('base64'), iterations: 600_000 });
  },
  async create(store, b, req, https) {
    if (!okParams(b) || !okProof(b.proof) || !okSealed(b.sealed)) return no(400, 'bad request');
    if (store.count() >= MAX_ACCOUNTS) return no(507, 'full');
    const authSalt = randomBytes(16).toString('hex');
    const now = new Date().toISOString();
    const row = { id: b.id, salt: b.salt, iterations: b.iterations, authSalt, authHash: (await hash(b.proof, authSalt)).toString('hex'), epoch: 1, rev: 1, sealed: pickSealed(b.sealed), updated: now, created: now, fails: 0, lockedUntil: 0 };
    if (!store.add(row)) return no(409, 'taken');
    return json({ ok: true, rev: 1, updated: now }, 201, { 'set-cookie': cookie(store, row, https) });
  },
  async open(store, b, req, https) {
    if (!okProof(b.proof)) return no(400, 'bad request');
    const row = store.get(b.id);
    const p = await prove(store, row, b.proof);
    if (p !== 'yes') return refuse(p);
    return json({ ok: true, rev: row.rev, updated: row.updated, ...(b.wantData === false ? {} : { sealed: JSON.parse(row.sealed) }) }, 200, { 'set-cookie': cookie(store, row, https) });
  },
  async read(store, b, req) {
    const row = whose(store, req);
    return row ? json({ ok: true, rev: row.rev, updated: row.updated, sealed: JSON.parse(row.sealed) }) : no(401, 'sign in');
  },
  async save(store, b, req) {
    const row = whose(store, req);
    if (!row) return no(401, 'sign in');
    if (!Number.isInteger(b.baseRev) || !okSealed(b.sealed)) return no(400, 'bad request');
    // Never over newer work from another computer.
    if (row.rev !== b.baseRev) return json({ ok: false, reason: 'newer', rev: row.rev, updated: row.updated }, 409);
    const updated = new Date().toISOString();
    if (!store.update(row.id, { sealed: pickSealed(b.sealed), rev: row.rev + 1, updated }, row.rev)) return json({ ok: false, reason: 'newer', rev: store.get(row.id)?.rev ?? row.rev, updated }, 409);
    return json({ ok: true, rev: row.rev + 1, updated });
  },
  /** A new passphrase: new proof, new salt and the library locked again with the new key, all at once. */
  async rekey(store, b, req, https) {
    if (!okProof(b.proof) || !okParams(b) || !okProof(b.newProof) || !okSealed(b.sealed) || !Number.isInteger(b.baseRev)) return no(400, 'bad request');
    const row = store.get(b.id);
    const p = await prove(store, row, b.proof);
    if (p !== 'yes') return refuse(p);
    if (row.rev !== b.baseRev) return json({ ok: false, reason: 'newer', rev: row.rev, updated: row.updated }, 409);
    const authSalt = randomBytes(16).toString('hex');
    const next = { salt: b.salt, iterations: b.iterations, authSalt, authHash: (await hash(b.newProof, authSalt)).toString('hex'), epoch: row.epoch + 1, rev: row.rev + 1, sealed: pickSealed(b.sealed), updated: new Date().toISOString(), fails: 0, lockedUntil: 0 };
    if (!store.update(row.id, next, row.rev)) return no(409, 'newer');
    return json({ ok: true, rev: next.rev, updated: next.updated }, 200, { 'set-cookie': cookie(store, { ...row, ...next }, https) });
  },
  async delete(store, b) {
    if (!okProof(b.proof)) return no(400, 'bad request');
    const row = store.get(b.id);
    const p = await prove(store, row, b.proof);
    if (p !== 'yes') return refuse(p);
    store.del(row.id);
    return json({ ok: true }, 200, { 'set-cookie': 'pt_sid=; Path=/api/vault; HttpOnly; SameSite=Strict; Max-Age=0' });
  },
  async close() {
    return json({ ok: true }, 200, { 'set-cookie': 'pt_sid=; Path=/api/vault; HttpOnly; SameSite=Strict; Max-Age=0' });
  },
};
/** Requests in ten minutes from one network. */
const LIMIT = { start: 60, create: 20, open: 60, read: 60, save: 600, rekey: 20, delete: 20, close: 60 };
const NEEDS_ID = new Set(['start', 'create', 'open', 'rekey', 'delete']);

export const savesWork = async () => !!(await openStore());

export async function vault(req, task) {
  if (!Object.hasOwn(TASKS, task)) return no(404, 'not found');
  if (req.method !== 'POST') return no(405, 'method');
  const site = req.headers.get('sec-fetch-site');
  // Only our own pages may call this. SameSite cookies are the second lock.
  if (site && site !== 'same-origin') return no(403, 'cross-site');
  if (!/^application\/json\b/.test(req.headers.get('content-type') ?? '')) return no(415, 'json only');
  const ip = (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  if (tooMany(`vault:${task}:${ip}`, LIMIT[task], 10 * 60 * 1000)) return no(429, 'busy');
  const text = await req.text();
  if (text.length > MAX_SEALED + 10_000) return no(413, 'too long');
  let b;
  try {
    b = JSON.parse(text);
  } catch {
    return no(400, 'bad json');
  }
  if (!b || typeof b !== 'object' || (NEEDS_ID.has(task) && !(typeof b.id === 'string' && ID.test(b.id)))) return no(400, 'bad request');
  const store = await openStore();
  if (!store) return no(503, 'no storage');
  return TASKS[task](store, b, req, req.headers.get('x-forwarded-proto') === 'https');
}
