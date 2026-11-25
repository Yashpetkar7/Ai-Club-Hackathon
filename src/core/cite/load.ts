import type { CitationStyle } from '@/core/contracts';
import { STYLE_FILE, type StyleFiles } from './engine';

const text = new Map<string, Promise<string>>();
function get(path: string): Promise<string> {
  let p = text.get(path);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}styles/${path}`).then((r) => {
      if (!r.ok) throw new Error('The citation style did not load. Check your connection and try again.');
      return r.text();
    });
    p.catch(() => text.delete(path));
    text.set(path, p);
  }
  return p;
}

/** Styles are served from our own site, once, when first needed. */
export async function loadStyle(style: CitationStyle): Promise<StyleFiles> {
  const [xml, us, gb] = await Promise.all([get(`${STYLE_FILE[style]}.csl`), get('locales-en-US.xml'), get('locales-en-GB.xml')]);
  return { style: xml, locales: { 'en-US': us, 'en-GB': gb } };
}
