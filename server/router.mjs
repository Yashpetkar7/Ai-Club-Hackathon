import { ai, aiConfigured } from './handlers/ai.mjs';
import { guardAi, guardRegistry } from './guard.mjs';
import { registry } from './handlers/registry.mjs';
import { MAX_SEALED, savesWork, vault } from './handlers/vault.mjs';

/** Returns a Response for /api/* and null for everything else. */
export async function route(req) {
  const p = new URL(req.url).pathname;
  if (!p.startsWith('/api/')) return null;
  if (p === '/api/health') return Response.json({ ok: true, ai: aiConfigured(), openalexKey: Boolean(process.env.OPENALEX_API_KEY), saves: await savesWork() });
  if (p === '/api/registry') return guardRegistry(req) ?? registry(req);
  if (p.startsWith('/api/vault/')) return vault(req, p.slice('/api/vault/'.length));
  if (p === '/api/ai') {
    const g = await guardAi(req);
    return g.res ?? ai(g.req);
  }
  return Response.json({ error: 'not found' }, { status: 404 });
}

/** Adapts Node's request and response to the web-standard ones above. */
export async function handleNode(nodeReq, nodeRes) {
  const chunks = [];
  // Only a locked library may be large.
  const max = nodeReq.url?.startsWith('/api/vault/') ? MAX_SEALED + 20_000 : 200_000;
  let size = 0;
  for await (const c of nodeReq) {
    chunks.push(c);
    size += c.length;
    if (size > max) {
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
