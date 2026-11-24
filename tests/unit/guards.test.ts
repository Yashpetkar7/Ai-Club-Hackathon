// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLAIM_TEXT, VERDICT_TEXT } from '@/core/contracts';
import { AGENTS, agentAllowed } from '@/policy/policy';

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const src = walk(resolve('src')).filter((f) => /\.(ts|tsx|css)$/.test(f));
const read = (f: string): string => readFileSync(f, 'utf8');

describe('honesty rules that a refactor must not break', () => {
  it('green only ever means proven', () => {
    expect(Object.entries(VERDICT_TEXT).filter(([, t]) => t.tone === 'ok').map(([k]) => k)).toEqual(['confirmed']);
    expect(Object.entries(CLAIM_TEXT).filter(([, t]) => t.tone === 'ok').map(([k]) => k)).toEqual(['verified']);
  });

  it('pages never create a verdict or a claim label', () => {
    const pages = src.filter((f) => /[\\/](pages|landing|app|ui)[\\/].*\.tsx?$/.test(f));
    for (const f of pages) {
      const t = read(f);
      expect(/verdict:\s*['"](confirmed|retracted|wrong-paper)/.test(t), `${f} sets a verdict`).toBe(false);
      expect(/label:\s*['"]verified['"]/.test(t), `${f} sets a claim label`).toBe(false);
      expect(/keys:\s*\{/.test(t), `${f} sets keys`).toBe(false);
    }
  });

  it('no AI agent holds a key and code agents always run', () => {
    for (const a of AGENTS) expect(agentAllowed(a.id, 0)).toBe(a.kind === 'code');
    expect(AGENTS.filter((a) => a.kind === 'ai').every((a) => a.minLevel >= 1)).toBe(true);
  });

  it('the interface never calls a source fake', () => {
    for (const f of src.filter((x) => /\.tsx$/.test(x))) {
      const visible = read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').replace(/Not found&rdquo; does not mean fake|“Not found” does not mean fake|Call a source fake/g, '').replace(/key:\s*'fake'/g, '');
      expect(/>[^<{]*\bfake\b[^<]*</i.test(visible), f).toBe(false);
    }
  });

  it('three.js stays out of every eagerly loaded file', () => {
    const importsThree = src.filter((f) => /from ['"]three['"]/.test(read(f))).map((f) => f.replace(/\\/g, '/').split('/src/')[1]).sort();
    expect(importsThree).toEqual(['landing/scene.ts', 'map/scene.ts']);
    for (const f of src) if (!f.endsWith('scene.ts')) expect(/from ['"]\.\/scene['"]/.test(read(f)), f).toBe(false);
  });

  it('no browser code reads an API key', () => {
    for (const f of src) expect(/import\.meta\.env\.VITE_|process\.env|API_KEY/.test(read(f)), f).toBe(false);
  });

  // Switch on at feature freeze:  FINAL=1 npx vitest run tests/unit/guards.test.ts
  it.runIf(process.env.FINAL === '1')('no page is still a stub', () => {
    expect(src.filter((f) => /<Stub\b/.test(read(f)))).toEqual([]);
  });
});
