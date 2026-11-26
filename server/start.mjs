// Serves the built site and the API from one process, for a laptop demo.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { loadEnvFile } from './env.mjs';
import { HEADERS } from './headers.mjs';
import { handleNode } from './router.mjs';

loadEnvFile();
const root = resolve('dist');
const port = Number(process.env.PORT ?? 4173);
// A host such as Render needs HOST=0.0.0.0 to reach the server. On a laptop it stays on this machine only.
const host = process.env.HOST ?? '127.0.0.1';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.csl': 'application/xml', '.xml': 'application/xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

createServer(async (req, res) => {
  try {
    if (req.url?.startsWith('/api/')) {
      await handleNode(req, res);
      return;
    }
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^([.][.][/\\])+/, '');
    let file = join(root, path);
    if ((file !== root && !file.startsWith(root + sep)) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', ...HEADERS });
    createReadStream(file).pipe(res);
  } catch {
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
    res.end('{"error":"server error"}');
  }
}).listen(port, host, () => console.log(`Paper Trail is running at http://${host}:${port}`));
