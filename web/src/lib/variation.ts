import { Chess } from 'chess.js'
import { useEffect, useMemo, useState } from 'react'
import { apiFetch, type PositionPreview } from '@/lib/api'
import { extendVariation, focusVariation, positionResult, variationChess, variationPath, variationTree, type VariationTree } from '@/lib/variation-tree'

export function useVariation(fen: string, scope: string | number) {
  const key = `${scope}:${fen}`
  const [trees, setTrees] = useState<Record<string, VariationTree>>({})
  const [active, setActive] = useState<{ key: string; cursor: number } | null>(null)
  const [picked, setPicked] = useState<{ key: string; square: string | null }>({ key, square: null })
  const tree = useMemo(() => trees[key] ?? variationTree(fen), [trees, key, fen])
  const exploring = active?.key === key
  const cursor = exploring ? active.cursor : 0
  const chess = useMemo(() => variationChess(tree, cursor), [tree, cursor])
  const path = useMemo(() => variationPath(tree, cursor), [tree, cursor])
  const result = positionResult(chess)
  const selected = picked.key === `${key}:${cursor}` ? picked.square : null
  const select = (square: string | null) => setPicked({ key: `${key}:${cursor}`, square })
  const go = (id: number) => {
    if (!tree.nodes[id]) return
    setTrees((all) => ({ ...all, [key]: focusVariation(tree, id) }))
    setActive({ key, cursor: id })
    select(null)
  }
  const follow = (moves: string[]) => {
    if (path.length + moves.length > 256) return false
    try {
      const next = extendVariation(tree, cursor, moves)
      setTrees((all) => ({ ...all, [key]: next.tree }))
      setActive({ key, cursor: next.cursor })
      select(null)
      return true
    } catch {
      return false
    }
  }
  const move = (from: string, to: string) => {
    try {
      const probe = new Chess(chess.fen())
      const m = probe.move({ from, to, promotion: 'q' })
      return follow([m.from + m.to + (m.promotion ?? '')])
    } catch {
      return false
    }
  }
  return {
    exploring, tree, cursor, chess, path, selected, select, move, follow, go,
    back: () => { setActive(null); select(null) },
    previous: () => go(tree.nodes[cursor].parent ?? 0),
    next: () => { const id = tree.nodes[cursor].preferred ?? tree.nodes[cursor].children[0]; if (id !== undefined) go(id) },
    result,
    terminalWhiteWin: result ? chess.isCheckmate() ? chess.turn() === 'w' ? 0 : 100 : 50 : undefined,
    lastMove: path.length ? { from: path.at(-1)!.uci!.slice(0, 2), to: path.at(-1)!.uci!.slice(2, 4) } : undefined,
  }
}

export type Variation = ReturnType<typeof useVariation>

/** The response belongs to the full root/history, never just a transposed FEN. */
export function usePositionPreview(rootFen: string, moves: string[], enabled: boolean) {
  const key = JSON.stringify([rootFen, moves])
  const [cache, setCache] = useState(() => new Map<string, PositionPreview>())
  const [result, setResult] = useState<{ key: string; data?: PositionPreview; error?: string } | null>(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!enabled || cache.has(key)) return
    const ctrl = new AbortController()
    const [fen, history] = JSON.parse(key) as [string, string[]]
    const timer = setTimeout(() => {
      apiFetch('/api/review/position', { method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fen, moves: history }) })
        .then(async (res) => {
          const body = await res.json()
          if (!res.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Could not analyse this position.')
          if (ctrl.signal.aborted) return
          setCache((old) => {
            const next = new Map(old).set(key, body)
            if (next.size > 128) next.delete(next.keys().next().value!)
            return next
          })
          setResult({ key, data: body })
        })
        .catch((e: Error) => {
          if (!ctrl.signal.aborted) setResult({ key, error: e.message })
        })
    }, 250)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [key, enabled, retry, cache])
  const entry = enabled ? cache.get(key) : undefined
  return {
    data: entry ?? (enabled && result?.key === key ? result.data : undefined),
    error: enabled && result?.key === key ? result.error : undefined,
    retry: () => { setResult(null); setRetry((n) => n + 1) },
  }
}
