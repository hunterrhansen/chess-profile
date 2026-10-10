import test from "node:test";
import assert from "node:assert/strict";
import { Chess } from "chess.js";
import { replayGame, replayIndex } from "../src/lib/game-replay.ts";

test("unanalysed games replay from SAN and expose each last move", () => {
  const replay = replayGame({ start_fen: null, san: ["e4", "e5", "Nf3"] });
  assert.equal(replay.positions.length, 4);
  assert.equal(replay.positions[0].lastMove, null);
  assert.deepEqual(replay.positions[3].lastMove, { from: "g1", to: "f3" });
  assert.deepEqual(replay.moves.map((m) => m.label), ["1. e4", "1… e5", "2. Nf3"]);
  assert.equal(new Chess(replay.positions[3].fen).get("f3").type, "n");
  assert.equal(replay.error, null);
});

test("custom black-to-move start preserves side and full move number", () => {
  const start = new Chess();
  start.move("e4");
  const fen = start.fen().replace(/ 1$/, " 17");
  const replay = replayGame({ start_fen: fen, san: ["e5", "Nf3"] });
  assert.equal(replay.positions[0].fen, fen);
  assert.deepEqual(replay.moves.map((m) => m.label), ["17… e5", "18. Nf3"]);
});

test("castling and en passant use the actual resulting board", () => {
  const castle = replayGame({ san: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "O-O"] });
  const board = new Chess(castle.positions.at(-1).fen);
  assert.equal(board.get("g1").type, "k");
  assert.equal(board.get("f1").type, "r");
  const ep = replayGame({ san: ["e4", "a6", "e5", "d5", "exd6"] });
  assert.equal(new Chess(ep.positions.at(-1).fen).get("d5"), undefined);
  assert.equal(new Chess(ep.positions.at(-1).fen).get("d6").color, "w");
});

test("underpromotion is replayed without substituting a queen", () => {
  const replay = replayGame({ start_fen: "7k/6P1/8/8/8/8/5K2/8 w - - 0 23", san: ["g8=N"] });
  assert.equal(new Chess(replay.positions[1].fen).get("g8").type, "n");
});

test("invalid SAN stops at the last valid board and reports the broken move", () => {
  const replay = replayGame({ san: ["e4", "e5", "bad", "Nc6"] });
  assert.equal(replay.moves.length, 2);
  assert.equal(replay.positions.length, 3);
  assert.match(replay.error, /half-move 3/);
});

test("invalid start FEN reports an error instead of showing a different game", () => {
  assert.throws(() => replayGame({ start_fen: "invalid", san: [] }), /starting position/);
});

test("empty games retain their start and navigation clamps at both ends", () => {
  assert.equal(replayGame({ san: [] }).positions.length, 1);
  assert.equal(replayIndex(-1, 3), 0);
  assert.equal(replayIndex(4, 3), 3);
  assert.equal(replayIndex(2, 3), 2);
  assert.equal(replayIndex(NaN, 3), 0);
});
