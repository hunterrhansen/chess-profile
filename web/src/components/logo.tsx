import { cn } from '@/lib/utils'

/** The knight's silhouette, facing left, on a 100×100 grid. */
const KNIGHT =
  'M30 88 L74 88 Q78 88 77 84 L72 66 Q81 54 80 40 Q78 21 60 12 L57 6 Q55 3 52 6 L48 13 Q41 14 35 19 L21 37 Q17 43 21 47 L26 52 Q30 55 35 52 L44 46 Q49 45 48 50 Q45 60 36 68 Q29 75 30 84 Z'

/**
 * Knightly's mark: a dark knight on a green tile sitting on its ledge, with a gold moon
 * behind its head (knight + nightly). `simple` drops the moon for sizes under 24px, where it
 * can't be seen; the favicon (public/favicon.svg) is that version. The colors are the brand
 * fills, the same in both themes.
 */
export function LogoMark({ simple, title, className }: { simple?: boolean; title?: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn('size-8 shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <rect x="4" y="8" width="92" height="88" rx="22" style={{ fill: 'var(--brand-lip)' }} />
      <rect x="4" y="4" width="92" height="88" rx="22" style={{ fill: 'var(--brand)' }} />
      {simple ? (
        <path d={KNIGHT} transform="translate(12 10) scale(.76)" style={{ fill: 'var(--on-brand)' }} />
      ) : (
        <>
          <circle cx="72" cy="27" r="13" style={{ fill: 'var(--gold)' }} />
          <circle cx="78.5" cy="22" r="11" style={{ fill: 'var(--brand)' }} />
          <g transform="translate(6 18) scale(.7)">
            <path d={KNIGHT} style={{ fill: 'var(--on-brand)' }} />
            <circle cx="50" cy="28" r="3.8" style={{ fill: 'var(--brand)' }} />
          </g>
        </>
      )}
    </svg>
  )
}

/** The mark with the name beside it, in Fredoka: the horizontal lockup. */
export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className={markClassName} />
      <span className="font-display text-xl leading-none font-bold tracking-tight">Knightly</span>
    </span>
  )
}
