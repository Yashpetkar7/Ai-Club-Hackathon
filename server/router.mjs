import { ai, aiConfigured } from './handlers/ai.mjs';
import { registry } from './handlers/registry.mjs';

/** Returns a Response for /api/* and null for everything else. */
export async function route(req) {
  const p = new URL(req.url).pathname;
  if (!p.startsWith('/api/')) return null;
  if (p === '/api/health') return Response.json({ ok: true, ai: aiConfigured(), openalexKey: Boolean(process.env.OPENALEX_API_KEY) });
  if (p === '/api/registry') return registry(req);
  if (p === '/api/ai') return ai(req);
  return Response.json({ error: 'not found' }, { status: 404 });
}

/** Adapts Node's request and response to the web-standard ones above. */
export async function handleNode(nodeReq, nodeRes) {
  const chunks = [];
  for await (const c of nodeReq) {
    chunks.push(c);
    if (chunks.reduce((n, x) => n + x.length, 0) > 200_000) {
      nodeRes.writeHead(413).end();
      return true;
    }
  }
  const req = new Request(`http://localhost${nodeReq.url}`, {
    method: nodeReq.method,
    headers: Object.fromEntries(Object.entries(nodeReq.headers).filter(([, v]) => typeof v === 'string')),
    body: ['GET', 'HEAD'].includes(nodeReq.method) ? undefined : Buffer.concat(chunks),
  });
  const res = await route(req);
  if (!res) return false;
  nodeRes.writeHead(res.status, Object.fromEntries(res.headers));
  nodeRes.end(Buffer.from(await res.arrayBuffer()));
  return true;
}
