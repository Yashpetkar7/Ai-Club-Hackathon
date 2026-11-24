// Serves the built site and the API from one process, for a laptop demo.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { loadEnvFile } from './env.mjs';
import { handleNode } from './router.mjs';

loadEnvFile();
const root = resolve('dist');
const port = Number(process.env.PORT ?? 4173);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

createServer(async (req, res) => {
  try {
    if (req.url?.startsWith('/api/')) {
      await handleNode(req, res);
      return;
    }
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^([.][.][/\\])+/, '');
    let file = join(root, path);
    if ((file !== root && !file.startsWith(root + sep)) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(500).end();
  }
}).listen(port, '127.0.0.1', () => console.log(`Paper Trail is running at http://127.0.0.1:${port}`));
