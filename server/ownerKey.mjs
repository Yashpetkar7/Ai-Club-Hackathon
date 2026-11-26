// The site owner's own Groq key, sent by the owner's browser as one header on /api/ai.
// It is checked for shape here and passed to Groq for the fixed AI tasks only.
// Nothing here stores, logs, echoes or returns it.
export const OWNER_HEADER = 'x-owner-ai-key';
const SHAPE = /^gsk_[A-Za-z0-9]{20,100}$/;

export const isOwnerKey = (v) => typeof v === 'string' && SHAPE.test(v);

/** The owner's key from a request, or null when there is none or it is not shaped like a Groq key. */
export function ownerKeyFrom(req) {
  const v = req.headers.get(OWNER_HEADER);
  return isOwnerKey(v) ? v : null;
}
