import test from 'node:test';
import assert from 'node:assert/strict';
import { practiceFlash } from '../src/lib/practice-feedback.ts';

test('prepared and saved verdicts share one reward, while retries and corrections get fresh cues', () => {
  const prepared = practiceFlash(1, 'e2e4', true);
  assert.deepEqual(practiceFlash(1, 'e2e4', true), prepared);
  assert.notEqual(practiceFlash(2, 'e2e4', true).id, prepared.id);
  assert.notEqual(practiceFlash(1, 'e2e4', false).id, prepared.id);
  assert.equal(prepared.square, 'e4');
  assert.equal(prepared.tone, 'right');
});

test('verdict haptics fire synchronously and only once per verdict identity', async () => {
  const { createVerdictHaptics } = await import('../src/lib/verdict-haptics.ts');
  const events = [];
  const acknowledge = createVerdictHaptics(tone => events.push(tone));
  const prepared = practiceFlash(1, 'e2e4', true);
  acknowledge(prepared);
  assert.deepEqual(events, ['right']);
  acknowledge(practiceFlash(1, 'e2e4', true));
  assert.deepEqual(events, ['right']);
  acknowledge(practiceFlash(1, 'e2e4', false));
  acknowledge(practiceFlash(2, 'e2e4', true));
  assert.deepEqual(events, ['right', 'wrong', 'right']);
});
