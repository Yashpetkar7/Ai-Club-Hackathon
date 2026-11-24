// Cached, allow-listed, read-only proxy. Plain Request in, plain Response out, so any host can run it.
const ALLOW = new Set(['api.crossref.org', 'api.openalex.org', 'api.datacite.org', 'doi.org', 'www.ebi.ac.uk', 'export.arxiv.org', 'openlibrary.org', 'doaj.org']);
const cache = new Map();
const TTL = 6 * 60 * 60 * 1000;
const MAX = 800;

export async function registry(req) {
  const target = new URL(req.url).searchParams.get('url');
  let u;
  try {
    u = new URL(target ?? '');
  } catch {
    return Response.json({ error: 'bad url' }, { status: 400 });
  }
  if (req.method !== 'GET' || u.protocol !== 'https:' || !ALLOW.has(u.hostname)) return Response.json({ error: 'not allowed' }, { status: 403 });
  // doi.org redirects to publishers, so only its lookup API may be used through here.
  if (u.hostname === 'doi.org' && !/^\/(api\/handles|ra)\//.test(u.pathname)) return Response.json({ error: 'not allowed' }, { status: 403 });
  const key = u.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return new Response(hit.body, { status: hit.status, headers: { 'content-type': hit.type, 'x-cache': 'hit' } });
  const out = new URL(u);
  if (u.hostname === 'api.openalex.org' && process.env.OPENALEX_API_KEY) out.searchParams.set('api_key', process.env.OPENALEX_API_KEY);
  try {
    const r = await fetch(out, { headers: { 'user-agent': 'paper-trail-student-project/0.1', accept: 'application/json, application/xml;q=0.8, */*;q=0.5' }, signal: AbortSignal.timeout(12000), redirect: 'follow' });
    const body = await r.text();
    const type = r.headers.get('content-type') ?? 'application/json';
    if (r.status === 200 || r.status === 404) {
      if (cache.size >= MAX) cache.delete(cache.keys().next().value);
      cache.set(key, { body, type, status: r.status, at: Date.now() });
    }
    const headers = { 'content-type': type, 'x-cache': 'miss' };
    const ra = r.headers.get('retry-after');
    if (ra) headers['retry-after'] = ra;
    return new Response(body, { status: r.status, headers });
  } catch {
    return Response.json({ error: 'registry did not answer' }, { status: 502 });
  }
}
