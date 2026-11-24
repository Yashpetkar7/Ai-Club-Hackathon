import type { Source } from '@/core/contracts';
import { cleanTitle } from '@/core/verify/normalise';

export interface Node { id: string; title: string; who: string; year?: number; flagged: boolean; linked: boolean; doi?: string }
export interface Graph { nodes: Node[]; cites: { from: string; to: string }[]; shared: { a: string; b: string; count: number }[]; noData: number }

/** Links exist only where a record's own reference list says so. */
export function buildGraph(sources: Source[]): Graph {
  const withRec = sources.filter((s) => s.record);
  const byOa = new Map(withRec.filter((s) => s.record!.openalexId).map((s) => [s.record!.openalexId!, s.id]));
  const cites: Graph['cites'] = [];
  const shared: Graph['shared'] = [];
  for (const s of withRec) for (const ref of new Set(s.record!.references ?? [])) {
    const to = byOa.get(ref);
    if (to && to !== s.id) cites.push({ from: s.id, to });
  }
  for (let i = 0; i < withRec.length; i++) for (let j = i + 1; j < withRec.length; j++) {
    const a = new Set(withRec[i]!.record!.references ?? []);
    const count = [...new Set(withRec[j]!.record!.references ?? [])].filter((x) => a.has(x)).length;
    if (count) shared.push({ a: withRec[i]!.id, b: withRec[j]!.id, count });
  }
  const on = new Set([...cites.flatMap((c) => [c.from, c.to]), ...shared.flatMap((c) => [c.a, c.b])]);
  return {
    nodes: withRec.map((s) => ({ id: s.id, title: cleanTitle(s.record!.title), who: `${s.record!.authors[0]?.family ?? 'No author'}${s.record!.authors.length > 1 ? ' et al.' : ''}`, flagged: !s.keys.checked, linked: on.has(s.id), ...(s.record!.year ? { year: s.record!.year } : {}), ...(s.record!.doi ? { doi: s.record!.doi } : {}) })),
    cites,
    shared,
    noData: withRec.filter((s) => !s.record!.references?.length).length,
  };
}

export type Layout = Record<string, [number, number, number]>;

/** A small spring layout. No randomness, so the map looks the same each time. */
export function layout(g: Graph, rounds = 160): Layout {
  const n = g.nodes.length;
  const p = g.nodes.map((_, i): [number, number, number] => {
    const y = n > 1 ? 1 - (2 * i) / (n - 1) : 0;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * 2.39996;
    return [Math.cos(a) * r * 4, y * 3, Math.sin(a) * r * 4];
  });
  const at = new Map(g.nodes.map((x, i) => [x.id, i]));
  const springs = [...g.cites.map((c) => [at.get(c.from)!, at.get(c.to)!, 0.05] as const), ...g.shared.map((s) => [at.get(s.a)!, at.get(s.b)!, Math.min(0.02, 0.005 * s.count)] as const)];
  for (let k = 0; k < rounds; k++) {
    const f = p.map((): [number, number, number] => [0, 0, 0]);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const d = [0, 1, 2].map((x) => p[i]![x]! - p[j]![x]!);
      const q = Math.max(0.2, d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2);
      for (let x = 0; x < 3; x++) { const s = (d[x]! / q) * 0.9; f[i]![x]! += s; f[j]![x]! -= s; }
    }
    for (const [i, j, w] of springs) for (let x = 0; x < 3; x++) { const s = (p[j]![x]! - p[i]![x]!) * w; f[i]![x]! += s; f[j]![x]! -= s; }
    for (let i = 0; i < n; i++) for (let x = 0; x < 3; x++) p[i]![x]! += Math.max(-0.3, Math.min(0.3, f[i]![x]! - p[i]![x]! * 0.012));
  }
  return Object.fromEntries(g.nodes.map((x, i) => [x.id, p[i]!]));
}
