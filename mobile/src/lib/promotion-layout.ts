import type { Square } from 'chess.js';
import type { Promotion } from './practice-flow';
import { coordinates } from './board-motion.ts';

/** Queen is on the destination; the stack extends back into the board. */
export function promotionLayout(square: Square, flipped: boolean, size: number, legal: Promotion[]) {
  const choices = (['q', 'n', 'r', 'b'] as Promotion[]).filter(kind => legal.includes(kind));
  const targetSize = Math.max(44, size / 8);
  const cancelSize = 44;
  const contentHeight = choices.length * targetSize + cancelSize;
  const height = Math.min(size, contentHeight);
  const point = coordinates(square, flipped);
  const fromBottom = point.y === 7;
  return {
    choices, targetSize, cancelSize, height, contentHeight, fromBottom,
    left: Math.max(0, Math.min(point.x * size / 8, size - targetSize)),
    top: fromBottom ? Math.max(0, size - height) : 0,
  };
}
