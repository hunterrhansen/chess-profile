import assert from 'node:assert/strict';
import { test } from 'node:test';

import { knightLoadingFrames } from '../src/lib/loading-motion.ts';

test('loading knight travels on two perpendicular legs instead of a diagonal', () => {
  assert.equal(typeof knightLoadingFrames, 'function');
  const frames = knightLoadingFrames(56);
  const landings = frames.filter(frame => frame.landing);
  assert.ok(landings.length > 2);
  for (let i = 1; i < landings.length; i++) {
    const dx = Math.abs(landings[i].x - landings[i - 1].x) / 56;
    const dy = Math.abs(landings[i].y - landings[i - 1].y) / 56;
    assert.deepEqual([dx, dy].sort(), [1, 2]);
  }
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1], b = frames[i];
    assert.ok(a.x === b.x || a.y === b.y, 'each leg must stay on one axis');
    assert.ok(b.percent > a.percent, 'animation time must increase');
    assert.ok(b.x >= 0 && b.x <= 112 && b.y >= 0 && b.y <= 112);
  }
});

test('loading loop closes without teleporting and scales to its board', () => {
  assert.equal(typeof knightLoadingFrames, 'function');
  for (const size of [40, 56, 64]) {
    const frames = knightLoadingFrames(size);
    assert.deepEqual(frames[0], {percent: 0, x: 0, y: size * 2, landing: true});
    assert.deepEqual(frames.at(-1), {percent: 100, x: 0, y: size * 2, landing: true});
    assert.deepEqual(frames.find(f => f.percent === 11.25), {percent: 11.25, x: 0, y: 0, landing: false});
    assert.deepEqual(frames.find(f => f.percent === 12.5), {percent: 12.5, x: size, y: 0, landing: true});
  }
});
