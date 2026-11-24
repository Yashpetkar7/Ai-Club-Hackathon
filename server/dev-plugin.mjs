import { loadEnvFile } from './env.mjs';
import { handleNode } from './router.mjs';

/** Serves /api/* inside `npm run dev`. */
export function apiDevPlugin() {
  return {
    name: 'paper-trail-api',
    configureServer(server) {
      loadEnvFile();
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        handleNode(req, res).then((done) => done || next(), () => {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end('{"error":"server error"}');
        });
      });
    },
  };
}
