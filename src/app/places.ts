import type { Project } from '@/core/contracts';

/**
 * Where a project opens. Before the plan is approved, Plan is the only page where anything can be done,
 * so the project opens there. After that it opens on Compass, the overview that works out the next step.
 */
export function projectHome(p: Pick<Project, 'plan'>): 'plan' | 'compass' {
  return p.plan?.approvedAt ? 'compass' : 'plan';
}

export const projectPath = (p: Pick<Project, 'id' | 'plan'>): string => `/p/${p.id}/${projectHome(p)}`;

/** Pages outside a project, in the order the palette lists them. `words` are matched but never shown. */
export const PAGE_PLACES: { key: string; label: string; to: string; words: string }[] = [
  { key: 'p-desk', label: 'Home', to: '/home', words: 'desk dashboard recent activity' },
  { key: 'p-check', label: 'Check references', to: '/check', words: 'doi reference list bibliography citation verify real retracted look up crossref openalex' },
  { key: 'p-audit', label: 'Audit a paragraph', to: '/audit', words: 'paragraph polished paraphrase claims essay whole text ai written trace scorecard by meaning' },
  { key: 'p-projects', label: 'Projects', to: '/projects', words: 'new project question start list' },
  { key: 'p-lab', label: 'Integrity Lab', to: '/lab', words: 'accuracy accurate metrics proof benchmark self test precision recall misses evaluation numbers' },
  { key: 'p-guide', label: 'How it works', to: '/guide', words: 'guide help explain three keys labels meaning scorecard tour' },
  { key: 'p-rules', label: 'House rules', to: '/rules', words: 'policy ai levels allowed limits what we check' },
  { key: 'p-account', label: 'Account', to: '/account', words: 'sign in passphrase backup profile' },
  { key: 'p-home', label: 'Start page', to: '/', words: 'landing front' },
];

/** Extra words for each page of a project, matched by the palette and never shown. Keys are the step keys in ProjectShell. */
export const PROJECT_WORDS: Record<string, string> = {
  compass: 'overview next step progress summary',
  team: 'agents automate run all',
  plan: 'question searches queries gate approve',
  find: 'search registries papers results keep skip',
  discover: 'meaning semantic similar related more like this openalex explore',
  library: 'sources approve folders tags notes doi pdf bibtex import',
  learn: 'study recall capture understand reflect',
  read: 'method findings limits aims sort compare abstract text',
  map: 'graph connections citations network links',
  evidence: 'claim sentence support quote scorecard by meaning verify disputed',
  ask: 'question answer sentences',
  challenge: 'other side opposite counter against',
  write: 'draft cite citation quotation copied',
  review: 'marker problems hand in feedback',
  export: 'reference list bibliography word ris bibtex apa harvard mla chicago ieee download statement',
};
