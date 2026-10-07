import type { Classification, MoveRow } from '@/lib/api'
import { isSound } from '@/lib/classification'

type Side = 'white' | 'black'

const BLUNDER_DROP = 20 // keep in step with analyze.THRESHOLDS

/** A turning point worth stopping on: a short label for the list, and one line saying what
 * happened, written for the player ("10…Qb4+ should have cost you the game"). */
export interface KeyMoment {
  ply: number
  kind: Classification
  short: string
  headline: string
}

/** "29…Qxc8" for Black, "10. Bxd4" for White. */
export function moveLabel(ply: number, san: string) {
  const n = Math.ceil(ply / 2)
  return ply % 2 === 1 ? `${n}. ${san}` : `${n}…${san}`
}

const pct = (v: number | null) => Math.round(v ?? 50)

/**
 * The moments a review stops on, in game order: your brilliant and great moves, your
 * mistakes, misses and blunders, and every blunder of theirs with how you answered it
 * (punished, or let slide). Each comes with a headline built from the engine's numbers.
 */
export function keyMoments(moves: MoveRow[], me: Side, opponent: string): KeyMoment[] {
  const out: KeyMoment[] = []
  const handled = new Set<number>() // your replies already described as answers to their blunder

  moves.forEach((m, i) => {
    const reply = moves[i + 1]
    if (m.color === me || !reply || pct(m.win_pct_before) - pct(m.win_pct_after) < BLUNDER_DROP) return
    handled.add(reply.ply)
    const theirs = moveLabel(m.ply, m.san)
    const yours = moveLabel(reply.ply, reply.san)
    if (isSound(reply.classification)) {
      const c = reply.classification
      out.push({
        ply: reply.ply,
        kind: c === 'brilliant' || c === 'great' ? c : 'best',
        short: 'Punished their blunder',
        headline: `${yours} punished ${theirs}: your chance went from ${pct(reply.win_pct_before)}% to ${pct(reply.win_pct_after)}%.`,
      })
    } else {
      const c = reply.classification
      out.push({
        ply: reply.ply,
        kind: c === 'mistake' || c === 'blunder' || c === 'miss' ? c : 'miss',
        short: 'Missed their blunder',
        headline: `${yours} let ${opponent}'s ${theirs} slide.${reply.best_san ? ` ${reply.best_san} was the move.` : ''}`,
      })
    }
  })

  moves.forEach((m, i) => {
    const c = m.classification
    if (m.color !== me || handled.has(m.ply) || !c) return
    const label = moveLabel(m.ply, m.san)
    const best = m.best_san ? ` ${m.best_san} was the move.` : ''
    if (c === 'brilliant') {
      out.push({ ply: m.ply, kind: c, short: 'Brilliant', headline: `${label} was brilliant: a sacrifice the engine agrees with.` })
    } else if (c === 'great') {
      out.push({ ply: m.ply, kind: c, short: 'Great: the only move', headline: `${label} was the only move that held. Anything else lost a lot.` })
    } else if (c === 'miss') {
      out.push({ ply: m.ply, kind: c, short: 'Missed their mistake', headline: `${label} let ${opponent}'s mistake slide.${best}` })
    } else if (c === 'mistake' || c === 'blunder') {
      // Did they hand it straight back? Then the lesson is the move, not the result.
      const reply = moves[i + 1]
      const givenBack = reply && pct(reply.win_pct_before) - pct(reply.win_pct_after) >= BLUNDER_DROP
      out.push({
        ply: m.ply,
        kind: c,
        short: givenBack ? `${c === 'blunder' ? 'Blunder' : 'Mistake'}, and they missed it` : c === 'blunder' ? 'Blunder' : 'Mistake',
        headline: givenBack
          ? `${label} should have cost you${c === 'blunder' ? ' the game' : ''}. ${opponent} missed it.`
          : `${label} dropped your chance from ${pct(m.win_pct_before)}% to ${pct(m.win_pct_after)}%.${best}`,
      })
    }
  })

  return out.sort((a, b) => a.ply - b.ply)
}

/** Your best moment, for the review summary: a brilliant or great move, else punishing their
 * blunder, else the move that left you best placed. */
export function bestMoment(moves: MoveRow[], me: Side, moments: KeyMoment[]) {
  const rank = (k: Classification) => (k === 'brilliant' ? 0 : k === 'great' ? 1 : 2)
  const good = moments.filter((k) => isSound(k.kind)).sort((a, b) => rank(a.kind) - rank(b.kind))[0]
  if (good) return { ply: good.ply, kind: good.kind, note: good.short }
  const mine = moves.filter((m) => m.color === me)
  if (!mine.length) return null
  const peak = mine.reduce((a, b) => (pct(b.win_pct_after) > pct(a.win_pct_after) ? b : a))
  return { ply: peak.ply, kind: peak.classification ?? 'good', note: `Your high point: ${pct(peak.win_pct_after)}% to win` }
}
