import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Chess } from 'chess.js'
import { extendVariation, focusVariation, variationChess, variationPath, variationTree, fenPly, positionResult } from '../src/lib/variation-tree.ts'

test('stepping backward and choosing alternatives retains both sides of the fork', () => {
  const root = variationTree(new Chess().fen())
  const first = extendVariation(root, 0, ['e2e4', 'e7e5', 'g1f3'])
  const second = extendVariation(first.tree, 1, ['c7c5'])
  assert.deepEqual(second.tree.nodes[1].children, [2, 4])
  assert.deepEqual(variationPath(second.tree, first.cursor).map(n => n.san), ['e4', 'e5', 'Nf3'])
  assert.deepEqual(variationPath(second.tree, second.cursor).map(n => n.san), ['e4', 'c5'])
  const reused = extendVariation(second.tree, 1, ['e7e5'])
  assert.equal(reused.cursor, 2)
  assert.equal(reused.tree.nodes.length, 5)
  assert.equal(second.tree.nodes[1].preferred, 4)
  assert.equal(reused.tree.nodes[1].preferred, 2)
  assert.equal(focusVariation(reused.tree, 4).nodes[1].preferred, 4)
  assert.equal(root.nodes.length, 1)
})

test('an illegal preview prefix commits nothing', () => {
  const root = variationTree(new Chess().fen())
  assert.throws(() => extendVariation(root, 0, ['e2e4', 'e2e5']))
  assert.equal(root.nodes.length, 1)
})

test('history preserves repetition and stops further play', () => {
  const root = variationTree(new Chess().fen())
  const loop = ['g1f3', 'g8f6', 'f3g1', 'f6g8']
  const played = extendVariation(root, 0, [...loop, ...loop])
  assert.equal(positionResult(variationChess(played.tree, played.cursor)), 'Draw by repetition')
  assert.throws(() => extendVariation(played.tree, played.cursor, ['e2e4']))
})

test('castling, en passant and underpromotion preserve legal board states', () => {
  const castle = extendVariation(variationTree(new Chess().fen()), 0, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'e1g1'])
  assert.equal(variationChess(castle.tree, castle.cursor).get('f1').type, 'r')
  const ep = extendVariation(variationTree(new Chess().fen()), 0, ['e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6'])
  assert.equal(variationChess(ep.tree, ep.cursor).get('d5'), undefined)
  const promote = extendVariation(variationTree('8/P7/8/8/8/8/7p/4K2k w - - 0 12'), 0, ['a7a8n'])
  assert.equal(variationChess(promote.tree, promote.cursor).get('a8').type, 'n')
  assert.equal(fenPly(promote.tree.nodes[0].fen), 22)
})

test('mate and stalemate are terminal and black custom starts number correctly', () => {
  const mate = extendVariation(variationTree(new Chess().fen()), 0, ['f2f3', 'e7e5', 'g2g4', 'd8h4'])
  assert.equal(positionResult(variationChess(mate.tree, mate.cursor)), 'Checkmate')
  assert.throws(() => extendVariation(mate.tree, mate.cursor, ['a2a3']))
  assert.equal(positionResult(new Chess('7k/5K2/6Q1/8/8/8/8/8 b - - 0 20')), 'Draw by stalemate')
  assert.equal(fenPly('7k/5K2/6Q1/8/8/8/8/8 b - - 0 20'), 39)
})
