import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
// Points git at the team's hooks so nothing is pushed by accident.
if (existsSync('.git')) {
  try { execSync('git config core.hooksPath .githooks'); } catch { /* git not installed */ }
}
