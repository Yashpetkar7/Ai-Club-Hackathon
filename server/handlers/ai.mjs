// AI gateway. Nihal owns this file: add tasks here, never open prompts.
// Contract: POST { task, level, input } -> { ok, data, model } | { ok: false, reason }.
// The permission level is checked here as well as in the page.
const MIN_LEVEL = { plan: 1, read: 2, challenge: 3 };

export const aiConfigured = () => Boolean(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY);

export async function ai(req) {
  if (req.method !== 'POST') return Response.json({ ok: false, reason: 'method' }, { status: 405 });
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, reason: 'bad json' }, { status: 400 });
  }
  const min = MIN_LEVEL[body?.task];
  if (min === undefined) return Response.json({ ok: false, reason: 'unknown task' }, { status: 400 });
  if (!(Number(body.level) >= min)) return Response.json({ ok: false, reason: 'locked', detail: `This assessment allows AI level ${Number(body.level) || 0}. This step needs level ${min}.` }, { status: 403 });
  if (!aiConfigured()) return Response.json({ ok: false, reason: 'no-key' }, { status: 503 });
  return Response.json({ ok: false, reason: 'not built yet' }, { status: 501 });
}
