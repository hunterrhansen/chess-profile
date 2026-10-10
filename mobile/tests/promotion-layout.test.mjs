import test from 'node:test';
import assert from 'node:assert/strict';
import { promotionLayout } from '../src/lib/promotion-layout.ts';

test('picker starts at the promotion edge and extends inward in either orientation', () => {
  for (const [square, flipped, left, fromBottom] of [
    ['g8', false, 292.5, false], ['g8', true, 48.75, true],
    ['a1', false, 0, true], ['a1', true, 341.25, false],
  ]) {
    const layout = promotionLayout(square, flipped, 390, ['q','r','b','n']);
    assert.equal(layout.left, left);
    assert.equal(layout.fromBottom, fromBottom);
    assert.deepEqual(layout.choices, ['q','n','r','b']);
    assert.ok(layout.top >= 0);
    assert.ok(layout.top + layout.height <= 390);
  }
});
test('small boards keep targets at least 44px and edge files inside the board', () => {
  for (const flipped of [false,true]) {
    const layout = promotionLayout('h8', flipped, 258, ['q','n','r','b']);
    assert.ok(layout.targetSize >= 44);
    assert.ok(layout.left >= 0);
    assert.ok(layout.left + layout.targetSize <= 258);
    assert.ok(layout.top + layout.height <= 258);
  }
});
test('only legal choices appear, ordered independently of their server order', () => {
  assert.deepEqual(promotionLayout('a8', false, 320, ['b','q','n']).choices, ['q','n','b']);
});

test('very short boards fit the picker viewport and preserve scrollable 44px targets', () => {
  for (const flipped of [false,true]) {
    const layout = promotionLayout('a8', flipped, 180, ['q','n','r','b']);
    assert.equal(layout.height, 180);
    assert.equal(layout.contentHeight, 220);
    assert.ok(layout.top + layout.height <= 180);
    assert.equal(layout.targetSize, 44);
  }
});
