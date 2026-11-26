// Runs before the AI handler. Keeps strangers and nonsense away from it.
import { OWNER_HEADER, ownerKeyFrom } from './ownerKey.mjs';

const seen = new Map();

/** Simple sliding window per address. In memory, so it resets when the server restarts. */
export function tooMany(key, max, windowMs, now = Date.now()) {
  const list = (seen.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  seen.set(key, list);
  if (seen.size > 5000) seen.delete(seen.keys().next().value);
  return list.length > max;
}

const no = (status, reason, detail) => ({ res: Response.json({ ok: false, reason, ...(detail ? { detail } : {}) }, { status }) });

export async function guardAi(req) {
  if (req.method !== 'POST') return no(405, 'method');
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return no(403, 'cross-site');
  const ip = (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  if (tooMany(`ai:${ip}`, 60, 10 * 60 * 1000)) return no(429, 'busy', 'Too many AI requests from this network. Try again in a few minutes.');
  const text = await req.text();
  if (text.length > 60_000) return no(413, 'too long');
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return no(400, 'bad json');
  }
  // The level is the student's own declaration. The server holds them to it and refuses anything that is not a real level.
  if (!Number.isInteger(body?.level) || body.level < 0 || body.level > 3) return no(400, 'bad level');
  if (typeof body.task !== 'string') return no(400, 'unknown task');
  // The owner's own key goes on only when it is shaped like a Groq key. Anything else is dropped here.
  const owner = ownerKeyFrom(req);
  return { req: new Request(req.url, { method: 'POST', headers: { 'content-type': 'application/json', ...(owner ? { [OWNER_HEADER]: owner } : {}) }, body: text }) };
}

/** Other sites may not use our proxy, and one network may not use it without end. */
export function guardRegistry(req) {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return Response.json({ error: 'cross-site' }, { status: 403 });
  const ip = (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  if (tooMany(`reg:${ip}`, 1500, 10 * 60 * 1000)) return Response.json({ error: 'busy' }, { status: 429, headers: { 'retry-after': '15' } });
  return null;
}
