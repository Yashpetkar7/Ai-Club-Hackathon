// What the browser is allowed to load, in one place. The build writes the same policy into the page,
// so it also holds on a host that sends no headers of its own.
const CSP = {
  'default-src': ["'self'"],
  // wasm-unsafe-eval is for the on-device support model only. No inline or remote script runs.
  'script-src': ["'self'", "'wasm-unsafe-eval'", 'blob:'],
  'worker-src': ["'self'", 'blob:'],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'https://fonts.gstatic.com'],
  'img-src': ["'self'", 'data:', 'blob:'],
  'connect-src': ["'self'", 'blob:', 'https://api.crossref.org', 'https://api.openalex.org', 'https://api.datacite.org', 'https://doi.org', 'https://huggingface.co', 'https://*.huggingface.co', 'https://*.hf.co', 'https://cdn.jsdelivr.net'],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'self'"],
};
export const csp = Object.entries(CSP).map(([k, v]) => `${k} ${v.join(' ')}`).join('; ');

export const HEADERS = {
  'content-security-policy': `${csp}; frame-ancestors 'none'`,
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};
