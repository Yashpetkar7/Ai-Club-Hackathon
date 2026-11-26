import type { RegistryRecord } from '@/core/contracts';
import { cleanTitle } from '@/core/verify/normalise';
import { bareOpenalexId, type Found } from './openalex';

/** Why a work is on the list. It says how it was found, never whether it is any good. */
export type FoundBy = 'words' | 'meaning' | 'both';
export const FOUND_BY: Record<FoundBy, string> = {
  words: 'Found by words',
  meaning: 'Found by meaning',
  both: 'Found by words and by meaning',
};

/** The usual constant of reciprocal rank fusion: a work at place r in a list scores 1/(60 + r). */
export const RRF_K = 60;

export interface Fused {
  key: string;
  record: RegistryRecord;
  openAccess: boolean;
  foundBy: FoundBy;
  /** Sum of 1/(60 + place) over the lists the work is in. Places start at 1. */
  score: number;
  /** Its place in the search by words, from 1. */
  wordsRank?: number;
  /** Its place in the search by meaning, from 1. */
  meaningRank?: number;
}

const oaIdOf = (r: RegistryRecord): string | undefined => bareOpenalexId(r.openalexId) ?? (r.registry === 'openalex' ? bareOpenalexId(r.id) : undefined);

/** Keeps every field the first record has, fills the gaps from the second, and keeps a retraction from either. */
function merge(a: RegistryRecord, b: RegistryRecord): RegistryRecord {
  const oa = oaIdOf(a) ?? oaIdOf(b);
  return { ...b, ...a, retracted: a.retracted || b.retracted, ...(oa ? { openalexId: oa } : {}) };
}

/**
 * Merges the search by words with the search by meaning by reciprocal rank fusion.
 * The same work is recognised by its DOI first, then by its OpenAlex id. A list that holds a work twice
 * counts it once, at its better place. Ties keep the order the works arrived in, words first.
 */
export function fuse(words: Found[], meaning: Found[]): Fused[] {
  const out: Fused[] = [];
  const byDoi = new Map<string, Fused>();
  const byOa = new Map<string, Fused>();
  const take = (list: Found[], lane: 'words' | 'meaning') =>
    list.forEach((f, i) => {
      const doi = f.record.doi?.toLowerCase();
      const oa = oaIdOf(f.record);
      let hit = (doi ? byDoi.get(doi) : undefined) ?? (oa ? byOa.get(oa) : undefined);
      if (!hit) {
        hit = { key: doi ? `doi:${doi}` : oa ? `oa:${oa}` : `title:${cleanTitle(f.record.title).toLowerCase()}`, record: f.record, openAccess: f.openAccess, foundBy: lane, score: 0 };
        out.push(hit);
      } else {
        hit.record = merge(hit.record, f.record);
        hit.openAccess ||= f.openAccess;
        if (hit.foundBy !== lane) hit.foundBy = 'both';
      }
      const place = lane === 'words' ? 'wordsRank' : 'meaningRank';
      if (hit[place] === undefined) {
        hit[place] = i + 1;
        hit.score += 1 / (RRF_K + i + 1);
      }
      const d = hit.record.doi?.toLowerCase();
      const o = oaIdOf(hit.record);
      if (d) byDoi.set(d, hit);
      if (o) byOa.set(o, hit);
    });
  take(words, 'words');
  take(meaning, 'meaning');
  // Array.prototype.sort is stable, so equal scores keep their arrival order.
  return out.sort((a, b) => b.score - a.score);
}

/** Why one work appears, in plain words, with the arithmetic shown. */
export function whyItAppears(h: Pick<Fused, 'wordsRank' | 'meaningRank' | 'score'>): string {
  const parts = [h.wordsRank && `place ${h.wordsRank} in the search by words`, h.meaningRank && `place ${h.meaningRank} in the search by meaning`].filter(Boolean);
  const sum = [h.wordsRank, h.meaningRank].filter((r): r is number => !!r).map((r) => `1/(${RRF_K}+${r})`).join(' + ');
  return `${parts.join(' and ')}. Score ${sum} = ${h.score.toFixed(4)}.`.replace(/^./, (c) => c.toUpperCase());
}
