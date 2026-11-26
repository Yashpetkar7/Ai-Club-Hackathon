import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statementLines } from '../../src/core/report/statement.ts';
import { GENESIS, hashOf, verifyChain } from '../../src/log/chain.ts';
import { ai } from '../../server/handlers/ai.mjs';
import { canCiteSource, sourceIssues } from '../../src/policy/apply.ts';

const event = (patch = {}) => ({ seq: 1, projectId: 'test-only-project', actor: 'ai', action: 'ai.plan', detail: 'answer used as a suggestion', model: 'TEST MODEL, NOT A LIVE CALL', at: '2026-11-25T00:00:00Z', prevHash: GENESIS, hash: '', ...patch });
const testSource = () => ({ id: 'TEST ONLY', projectId: 'TEST ONLY', origin: 'manual', keys: { found: true, checked: true, approved: true }, record: { id: 'TEST ONLY', title: 'TEST RECORD: NOT A PUBLICATION', authors: [], year: 2026, type: 'journal-article', registry: 'crossref' }, check: { verdict: 'confirmed' } });
test('SAMPLE receipts cannot be cited even with all keys and a written exception', () => {
  const source = testSource();
  assert.equal(canCiteSource(source), true);
  source.check.sample = true;
  source.keptWithReason = 'TEST ONLY: written reason must never disguise a sample as live evidence';
  assert.equal(canCiteSource(source), false);
  assert.match(sourceIssues(source).join(' '), /SAMPLE/);
});
test('live written exceptions remain possible but still require student approval', () => {
  const source = testSource();
  source.keys.checked = false;
  source.check.verdict = 'one-registry';
  assert.equal(canCiteSource(source), false);
  source.keptWithReason = 'TEST ONLY: reviewed the unresolved registry receipt';
  assert.equal(canCiteSource(source), true);
  source.keys.approved = false;
  assert.equal(canCiteSource(source), false);
});
test('empty records never prove no AI use or complete verification', () => {
  const text = statementLines([], { aiLevel: 0 }).join(' ');
  assert.match(text, /No calls.*recorded/);
  assert.match(text, /outside|elsewhere/);
  assert.match(text, /does not establish/);
});
test('disclosure includes actual prompt and explicitly missing components', () => {
  const text = statementLines([event({ prompt: 'TEST PROMPT: suggest search phrases' })], { aiLevel: 1 }).join(' ');
  assert.match(text, /TEST PROMPT/);
  assert.match(text, /which sections/);
  assert.match(statementLines([event()], { aiLevel: 1 }).join(' '), /Prompts are missing/);
});
test('malformed decisions are ignored and approvals are events rather than unique papers', () => {
  const text = statementLines([event(), event({ seq: 2, actor: 'student', action: 'ai.plan.decided', detail: 'null' }), event({ seq: 3, actor: 'student', action: 'source.approved', detail: 'Same paper' }), event({ seq: 4, actor: 'student', action: 'source.approved', detail: 'Same paper' })], { aiLevel: 0 }).join(' ');
  assert.match(text, /does not record which suggestions/);
  assert.match(text, /2 source-approval events/);
  assert.doesNotMatch(text, /I approved 2 sources/);
  assert.match(text, /current AI permission level is 0/);
});
test('student supplement is identified as self disclosure', () => {
  const text = statementLines([event({ actor: 'student', action: 'ai.disclosure', detail: JSON.stringify({ sections: 'Search planning', incorporation: 'I reviewed the phrases before using them' }) })], { aiLevel: 1 }).join(' ');
  assert.match(text, /Search planning/);
  assert.match(text, /my own account, not an independently checked event/);
});
test('chain detects changed content, removed middle entries, reordering and cross-project splices', async () => {
  const events = [];
  for (let i = 1; i <= 3; i++) {
    const e = event({ seq: i, detail: `TEST EVENT ${i}`, prevHash: events.at(-1)?.hash ?? GENESIS });
    e.hash = await hashOf(e); events.push(e);
  }
  assert.equal((await verifyChain(events)).ok, true);
  assert.equal((await verifyChain(events.map((e, i) => i === 1 ? { ...e, detail: 'TEST TAMPERING' } : e))).ok, false);
  assert.equal((await verifyChain([events[0], events[2]])).ok, false);
  assert.equal((await verifyChain([events[1], events[0], events[2]])).ok, false);
  const splice = { ...events[1], projectId: 'different-test-project' }; splice.hash = await hashOf(splice);
  assert.equal((await verifyChain([events[0], splice])).ok, false);
  // Explicit limitation: a consistent prefix alone cannot reveal a deleted tail.
  assert.equal((await verifyChain(events.slice(0, 2))).ok, true);
});
test('AI handler independently rejects invalid or insufficient levels without a provider call', async () => {
  for (const level of [-1, 4, '3', 1.5, null, 0]) {
    const response = await ai(new Request('http://local.test/api/ai', { method: 'POST', body: JSON.stringify({ task: 'read', level, input: { question: 'TEST ONLY', passages: [{ id: 'p1', text: 'TEST ONLY' }] } }) }));
    assert.equal(response.status, 403);
  }
});
