import { Chess } from 'chess.js'

export interface VariationNode {
  id: number
  parent: number | null
  children: number[]
  preferred: number | null
  fen: string
  uci: string | null
  san: string | null
}
export interface VariationTree {
  nodes: VariationNode[]
}

export function variationTree(fen: string): VariationTree {
  return { nodes: [{ id: 0, parent: null, children: [], preferred: null, fen, uci: null, san: null }] }
}

export function variationPath(tree: VariationTree, id: number): VariationNode[] {
  const path: VariationNode[] = []
  let node = tree.nodes[id]
  while (node.parent !== null) {
    path.unshift(node)
    node = tree.nodes[node.parent]
  }
  return path
}

export function variationChess(tree: VariationTree, id: number): Chess {
  const chess = new Chess(tree.nodes[0].fen)
  for (const node of variationPath(tree, id)) chess.move(node.uci!)
  return chess
}

/** Validate the whole prefix before committing; reuse children, never overwrite them. */
export function extendVariation(tree: VariationTree, id: number, moves: string[]) {
  const chess = variationChess(tree, id)
  const nodes = tree.nodes.map((n) => ({ ...n, children: [...n.children] }))
  let cursor = id
  for (const uci of moves) {
    if (chess.isGameOver()) throw new Error('The position is over.')
    const move = chess.move(uci)
    const canonical = move.from + move.to + (move.promotion ?? '')
    const existing = nodes[cursor].children.find((child) => nodes[child].uci === canonical)
    if (existing !== undefined) {
      nodes[cursor].preferred = existing
      cursor = existing
    }
    else {
      const next = nodes.length
      nodes.push({ id: next, parent: cursor, children: [], preferred: null, fen: chess.fen(), uci: canonical, san: move.san })
      nodes[cursor].children.push(next)
      nodes[cursor].preferred = next
      cursor = next
    }
  }
  return { tree: { nodes }, cursor }
}

/** Returning to an alternative makes Next follow that continuation again. */
export function focusVariation(tree: VariationTree, id: number): VariationTree {
  const nodes = tree.nodes.map((n) => ({ ...n }))
  for (const node of variationPath(tree, id)) nodes[node.parent!].preferred = node.id
  return { nodes }
}

/** Absolute ply from FEN, including custom starts and Black to move. */
export function fenPly(fen: string) {
  const parts = fen.split(' ')
  return (Number(parts[5]) - 1) * 2 + (parts[1] === 'b' ? 1 : 0)
}

export function positionResult(chess: Chess): string | null {
  if (chess.isCheckmate()) return 'Checkmate'
  if (chess.isStalemate()) return 'Draw by stalemate'
  if (chess.isThreefoldRepetition()) return 'Draw by repetition'
  if (chess.isInsufficientMaterial()) return 'Draw by insufficient material'
  if (chess.isDraw()) return 'Draw by the fifty-move rule'
  return null
}
