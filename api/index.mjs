// The same /api the laptop server runs, for Vercel. Registry lookups and the AI gateway work here.
// Saving does not, because there is no disk: accounts stay on the student's device and the page says so.
import { route } from '../server/router.mjs';

const handle = async (req) => (await route(req)) ?? Response.json({ error: 'not found' }, { status: 404 });
export const GET = handle;
export const POST = handle;
