/**
 * The site owner's own Groq key, set in the hidden panel at #/lab?owner.
 * Kept in this tab (sessionStorage), or on this device (localStorage) only when the owner ticks Remember.
 * Never in Dexie (locked copies and exports read Dexie), never in a URL, the log, an export or an error message.
 * It leaves the browser only as one header on our own same-origin /api/ai, and the server passes it to Groq.
 */
export const OWNER_KEY_STORE = 'pt-owner-ai-key';
export const OWNER_HEADER = 'x-owner-ai-key';
const SHAPE = /^gsk_[A-Za-z0-9]{20,100}$/;
const CHANGED = 'pt-owner-key-changed';

export const isOwnerKeyShape = (key: unknown): key is string => typeof key === 'string' && SHAPE.test(key);

const tab = (): Storage => globalThis.sessionStorage;
const device = (): Storage => globalThis.localStorage;

/** A blocked or private-mode store throws. That is never an error the owner sees with the key in it. */
function read(store: () => Storage): string | null {
  try {
    const v = store().getItem(OWNER_KEY_STORE);
    return isOwnerKeyShape(v) ? v : null;
  } catch {
    return null;
  }
}
function put(store: () => Storage, value: string | null): boolean {
  try {
    if (value === null) store().removeItem(OWNER_KEY_STORE);
    else store().setItem(OWNER_KEY_STORE, value);
    return true;
  } catch {
    return false;
  }
}
function changed(): void {
  try {
    window.dispatchEvent(new Event(CHANGED));
  } catch {
    // Nothing is listening outside a browser.
  }
}

export const getOwnerKey = (): string | null => read(tab) ?? read(device);

/** Where the saved key lives: this tab, this device, or nowhere. */
export const ownerKeyWhere = (): 'tab' | 'device' | null => (read(tab) ? 'tab' : read(device) ? 'device' : null);

/** Saves a key shaped like a Groq key. Returns false when the shape is wrong or the browser would not store it. */
export function setOwnerKey(key: string, remember: boolean): boolean {
  if (!isOwnerKeyShape(key)) return false;
  const ok = remember ? put(device, key) && put(tab, null) : put(tab, key) && put(device, null);
  changed();
  return ok;
}

/** Removes the key from this tab and this device. Returns false when a store would not let go of it. */
export function clearOwnerKey(): boolean {
  const ok = [put(tab, null), put(device, null)].every(Boolean);
  changed();
  return ok;
}

/** For useSyncExternalStore: where the key is and its last 4 characters, never the key itself. */
export const ownerKeySnapshot = (): string => {
  const key = getOwnerKey();
  return key ? `${ownerKeyWhere()}:${key.slice(-4)}` : '';
};

export function onOwnerKey(cb: () => void): () => void {
  window.addEventListener(CHANGED, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(CHANGED, cb);
    window.removeEventListener('storage', cb);
  };
}
