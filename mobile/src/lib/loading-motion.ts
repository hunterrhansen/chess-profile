// The eight perimeter squares form a closed knight tour on a 3×3 board.
const squares = [[0, 2], [1, 0], [2, 2], [0, 1], [2, 0], [1, 2], [0, 0], [2, 1], [0, 2]];
export const KNIGHT_LOADING_MS = 8000;
export function knightLoadingFrames(squareSize: number) {
  const frames = [{ percent: 0, x: 0, y: squareSize * 2, landing: true }];
  for (let i = 0; i < squares.length - 1; i++) {
    const [x, y] = squares[i];
    const [nextX, nextY] = squares[i + 1];
    // Hold 700ms, travel two squares in 200ms, then one square in 100ms.
    // Keeping the same transform list at every frame prevents diagonal interpolation.
    frames.push({ percent: i * 12.5 + 8.75, x: x * squareSize, y: y * squareSize, landing: false });
    frames.push({
      percent: i * 12.5 + 11.25,
      x: (Math.abs(nextX - x) === 2 ? nextX : x) * squareSize,
      y: (Math.abs(nextY - y) === 2 ? nextY : y) * squareSize,
      landing: false,
    });
    frames.push({ percent: (i + 1) * 12.5, x: nextX * squareSize, y: nextY * squareSize, landing: true });
  }
  return frames;
}
