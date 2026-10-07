import { useMemo } from 'react'
import { useReducedMotion } from '@/lib/motion'
import { cn } from '@/lib/utils'

const COLORS = ['--brand', '--gold', '--sky', '--danger', '--move-brilliant', '--gold']

/** A one-shot burst of confetti from the middle of its parent (give the parent `relative`).
 * Only for the big moments: finishing the day's positions, a personal best, a Brilliant you
 * found yourself. One per view, never on a loop. Key it to fire again. Renders nothing when
 * reduced motion is on. */
export function Confetti({
  pieces = 36,
  spread = 1,
  seed = 1,
  className,
}: {
  pieces?: number
  spread?: number
  /** Change it for a different-looking burst. */
  seed?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const bits = useMemo(() => {
    const random = mulberry32(seed)
    return Array.from({ length: pieces }, (_, i) => {
      // spread evenly round the circle with some jitter, thrown harder upward
      const angle = (i / pieces) * Math.PI * 2 + random() * 0.5
      const power = (90 + random() * 110) * spread
      const dx = Math.cos(angle) * power
      const up = Math.min(0, Math.sin(angle) * power) - 40 * spread - random() * 60 * spread
      return {
        color: COLORS[i % COLORS.length],
        round: i % 3 === 0,
        dx,
        up,
        fall: up + (140 + random() * 120) * spread,
        spin: (random() < 0.5 ? -1 : 1) * (240 + random() * 480),
        ms: 1000 + random() * 600,
        delay: random() * 80,
      }
    })
  }, [pieces, spread, seed])
  if (reduced) return null
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 grid place-items-center overflow-visible', className)}>
      {bits.map((b, i) => (
        <span
          key={i}
          className={cn('col-start-1 row-start-1 animate-confetti', b.round ? 'size-2.5 rounded-full' : 'h-3.5 w-2 rounded-[2px]')}
          style={
            {
              backgroundColor: `var(${b.color})`,
              '--dx': `${b.dx}px`,
              '--up': `${b.up}px`,
              '--fall': `${b.fall}px`,
              '--spin': `${b.spin}deg`,
              animationDuration: `${b.ms}ms`,
              animationDelay: `${b.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}

/** A small seeded random number generator, so a burst renders the same way every time. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
