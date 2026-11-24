import { existsSync, readFileSync } from 'node:fs';

/** Reads .env.local without a dependency. Never overrides a variable that is already set. */
export function loadEnvFile(path = '.env.local') {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
