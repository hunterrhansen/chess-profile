import test from 'node:test';
import assert from 'node:assert/strict';
import { preparedQuality } from '../src/lib/practice-feedback.ts';
const card = {fen_before:'position', feedback:{version:1, fen:'position', grades:{e2e4:'best', d2d4:'excellent', g2g4:'wrong'}}};
test('prepared feedback preserves alternative good moves and leaves unknown moves pending', () => {
  assert.equal(preparedQuality(card,'d2d4'), 'excellent');
  assert.equal(preparedQuality(card,'g2g4'), 'wrong');
  assert.equal(preparedQuality(card,'b1c3'), undefined);
});
test('missing, malformed or obsolete feedback cannot produce a local verdict', () => {
  assert.equal(preparedQuality({...card, feedback:null}, 'e2e4'), undefined);
  assert.equal(preparedQuality({...card, feedback:{...card.feedback,fen:'other'}},'e2e4'), undefined);
  assert.equal(preparedQuality({...card, feedback:{...card.feedback,version:0}},'e2e4'), undefined);
  assert.equal(preparedQuality({...card, feedback:{...card.feedback,grades:{e2e4:'unknown'}}},'e2e4'), undefined);
  assert.equal(preparedQuality(card,'0000'), undefined);
});
