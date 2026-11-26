// Offline, dependency-free checks on the same TypeScript modules used by the app.
// Node 22 strips types; this hook only resolves the app's aliases and extensions.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve as pathResolve } from 'node:path';

export async function resolve(specifier, context, nextResolve) {
  let url;
  if (specifier.startsWith('@/')) url = pathToFileURL(pathResolve('src', specifier.slice(2)));
  else if (specifier.startsWith('.') && context.parentURL) url = new URL(specifier, context.parentURL);
  if (url?.protocol === 'file:' && !/\.[a-z]+$/i.test(url.pathname)) {
    for (const suffix of ['.ts', '.js', '/index.ts']) {
      if (existsSync(fileURLToPath(url) + suffix)) return { url: pathToFileURL(fileURLToPath(url) + suffix).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('.json')) return { format: 'module', source: `export default ${JSON.stringify(JSON.parse(readFileSync(fileURLToPath(url), 'utf8')))};`, shortCircuit: true };
  return nextLoad(url, context);
}
