import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPracticeAttempt } from '../src/lib/practice-attempt.ts';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
test('board previews immediately, grading waits for durable preparation and settlement', async () => {
  const saved = deferred(), response = deferred(), settled = deferred();
  const events = [], phases = [];
  const run = checkPracticeAttempt({
    preview: () => events.push('moved'), prepare: () => saved.promise,
    request: () => { events.push('requested'); return response.promise; },
    settle: () => { events.push('settling'); return settled.promise; },
    accept: result => events.push(result.correct ? 'right' : 'wrong'),
    restore: () => events.push('restored'), report: timing => phases.push(timing),
  });
  assert.deepEqual(events, ['moved']);
  saved.resolve(); await new Promise(r => setImmediate(r));
  assert.deepEqual(events, ['moved', 'requested']);
  response.resolve({correct: true}); await new Promise(r => setImmediate(r));
  assert.deepEqual(events, ['moved', 'requested', 'settling']);
  settled.resolve(); await run;
  assert.deepEqual(events, ['moved', 'requested', 'settling', 'right']);
  assert.equal(phases[0].status, 'saved');
  assert.ok(phases[0].request_ms >= 0);
});
test('failed request restores the board and never applies a grade', async () => {
  const events = [];
  await assert.rejects(checkPracticeAttempt({
    preview: () => events.push('moved'), prepare: async () => {},
    request: async () => { throw new Error('offline'); },
    settle: async () => events.push('settled'), accept: () => events.push('graded'),
    restore: () => events.push('restored'), report: () => {},
  }), /offline/);
  assert.deepEqual(events, ['moved', 'restored']);
});
test('a failed attempt can be retried and diagnostics cannot change the saved grade', async () => {
  let failed = true;
  const events = [];
  const steps = {
    preview: () => events.push('moved'), prepare: async () => {},
    request: async () => { if (failed) throw new Error('offline'); return {correct:true}; },
    settle: async () => events.push('settled'), accept: () => events.push('graded'),
    restore: () => events.push('restored'), report: () => { throw new Error('diagnostic failure'); },
  };
  await assert.rejects(checkPracticeAttempt(steps), /offline/);
  failed = false;
  await checkPracticeAttempt(steps);
  assert.deepEqual(events, ['moved','restored','moved','settled','graded']);
});

test('authoritative verdict acknowledges before local settlement completes', async () => {
  const response = deferred(), settled = deferred();
  const events = [];
  const run = checkPracticeAttempt({
    preview: () => events.push('preview'), prepare: async () => {},
    request: () => response.promise,
    verdict: result => events.push(result.correct ? 'haptic' : 'wrong'),
    settle: () => { events.push('settling'); return settled.promise; },
    accept: () => events.push('complete'), restore: () => {}, report: () => {},
  });
  await new Promise(r => setImmediate(r));
  assert.deepEqual(events, ['preview']);
  response.resolve({correct:true});
  await new Promise(r => setImmediate(r));
  assert.deepEqual(events, ['preview','haptic','settling']);
  settled.resolve(); await run;
  assert.deepEqual(events, ['preview','haptic','settling','complete']);
});
