import { useSyncExternalStore } from 'react';

/** Hash routes work on any static host and on a laptop with no rewrites. */
const read = (): string => window.location.hash.replace(/^#/, '') || '/';

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

export function Link({ to, children, ...rest }: { to: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  );
}
