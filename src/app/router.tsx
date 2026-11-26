import { useSyncExternalStore } from 'react';

/** Hash routes work on any static host and on a laptop with no rewrites. */
const read = (): string => window.location.hash.replace(/^#/, '') || '/';

/** How many pages of this site are behind the current one in this tab. */
let depth = 0;
let going = 0;
if (typeof window !== 'undefined')
  window.addEventListener('hashchange', () => {
    depth = Math.max(0, depth + (going < 0 ? -1 : 1));
    going = 0;
  });

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useRoute(): { path: string; parts: string[] } {
  const path = useSyncExternalStore(subscribe, read, () => '/');
  return { path, parts: path.split('?')[0]!.split('/').filter(Boolean) };
}

export const go = (path: string): void => {
  window.location.hash = path;
};

/** Where Back goes when the tab was opened straight on this page. */
export function parentOf(path: string): string {
  const parts = path.split('?')[0]!.split('/').filter(Boolean);
  // Above a project page is the project's own address, which opens on Plan or Compass. Above those is Projects.
  if (parts[0] === 'p') return parts[2] && parts[2] !== 'plan' && parts[2] !== 'compass' ? `/p/${parts[1]}` : '/projects';
  if (parts[0] === 'projects' || parts[0] === 'account') return '/home';
  return '/';
}

/** The page you came from, or the one above this when there is none. Never leaves the site. */
export function goBack(): void {
  if (depth > 0) {
    going = -1;
    window.history.back();
  } else go(parentOf(read()));
}

export function Link({ to, children, ...rest }: { to: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  );
}
