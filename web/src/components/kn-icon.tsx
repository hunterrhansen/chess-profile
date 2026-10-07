import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** `fill: var(--x)` as a style: tokens can't go in SVG fill attributes. */
const f = (token: string) => ({ fill: `var(--${token})` })

const GLYPHS = {
  home: (
    <>
      <path transform="translate(0 2)" style={f('brand-lip')} d="M7 4h4v3h3V4h4v3h3V4h4v7l-3 3v9h3v3H7v-3h3v-9l-3-3z" />
      <path style={f('brand')} d="M7 4h4v3h3V4h4v3h3V4h4v7l-3 3v9h3v3H7v-3h3v-9l-3-3z" />
      <rect x="14" y="17" width="4" height="6" rx="2" style={f('brand-lip')} />
    </>
  ),
  games: (
    <>
      <rect x="4" y="6" width="24" height="24" rx="5" style={f('brand-lip')} />
      <rect x="4" y="4" width="24" height="24" rx="5" style={f('board-dark')} />
      <path style={f('board-light')} d="M4 16V9a5 5 0 0 1 5-5h7v12z" />
      <path style={f('board-light')} d="M28 16v7a5 5 0 0 1-5 5h-7V16z" />
    </>
  ),
  play: (
    <>
      <g transform="translate(0 2)" style={f('sky-lip')}>
        <path d="M9 24h14l-1-5c2-3 2-8-1-12-1-2-3-3-5-4l-1 2-2-1-3 3-4 5 1 3 4-1 2-1 1 2z" />
        <rect x="7" y="23" width="18" height="5" rx="2.5" />
      </g>
      <path style={f('sky')} d="M9 24h14l-1-5c2-3 2-8-1-12-1-2-3-3-5-4l-1 2-2-1-3 3-4 5 1 3 4-1 2-1 1 2z" />
      <rect x="7" y="23" width="18" height="5" rx="2.5" style={f('sky')} />
      <circle cx="13.5" cy="9.5" r="1.4" style={f('on-sky')} />
    </>
  ),
  progress: (
    <>
      <g transform="translate(0 2)" style={f('gold-lip')}>
        <rect x="4" y="16" width="7" height="11" rx="2.5" />
        <rect x="12.5" y="10" width="7" height="17" rx="2.5" />
        <rect x="21" y="4" width="7" height="23" rx="2.5" />
      </g>
      <g style={f('gold')}>
        <rect x="4" y="16" width="7" height="11" rx="2.5" />
        <rect x="12.5" y="10" width="7" height="17" rx="2.5" />
        <rect x="21" y="4" width="7" height="23" rx="2.5" />
      </g>
    </>
  ),
  settings: (
    <>
      <circle cx="16" cy="16" r="11" style={{ fill: 'none', stroke: 'var(--ink-muted)', strokeWidth: 5, strokeDasharray: '4.3 4.34' }} />
      <circle cx="16" cy="16" r="9" style={f('ink-muted')} />
      <circle cx="16" cy="16" r="3.5" style={f('surface')} />
    </>
  ),
  goal: (
    <>
      <rect x="6" y="3" width="3.5" height="26" rx="1.75" style={f('ink-muted')} />
      <path transform="translate(0 2)" style={f('danger-lip')} d="M9.5 4H26l-4 6 4 6H9.5z" />
      <path style={f('danger')} d="M9.5 4H26l-4 6 4 6H9.5z" />
    </>
  ),
  drill: (
    <>
      <circle cx="16" cy="17" r="12.5" style={f('danger-lip')} />
      <circle cx="16" cy="15" r="12.5" style={f('danger')} />
      <circle cx="16" cy="15" r="8" style={f('surface')} />
      <circle cx="16" cy="15" r="4" style={f('danger')} />
    </>
  ),
  review: (
    <>
      <path d="M20 20l7 7" style={{ stroke: 'var(--sky-lip)', strokeWidth: 5.5, strokeLinecap: 'round' }} />
      <circle cx="13.5" cy="15.5" r="9.5" style={f('sky-lip')} />
      <circle cx="13.5" cy="13.5" r="9.5" style={f('sky')} />
      <circle cx="13.5" cy="13.5" r="5" style={f('surface')} />
    </>
  ),
  trophy: (
    <>
      <path
        d="M9 8H5.5a1 1 0 0 0-1 1c0 4 2.5 6.5 6 6.5M23 8h3.5a1 1 0 0 1 1 1c0 4-2.5 6.5-6 6.5"
        style={{ fill: 'none', stroke: 'var(--gold-lip)', strokeWidth: 2.5, strokeLinecap: 'round' }}
      />
      <g transform="translate(0 2)" style={f('gold-lip')}>
        <path d="M9 4h14v7a7 7 0 0 1-14 0z" />
        <rect x="9.5" y="22" width="13" height="5" rx="2.5" />
      </g>
      <path style={f('gold')} d="M9 4h14v7a7 7 0 0 1-14 0z" />
      <rect x="14" y="17" width="4" height="6" style={f('gold-lip')} />
      <rect x="9.5" y="22" width="13" height="5" rx="2.5" style={f('gold')} />
    </>
  ),
  notes: (
    <>
      <rect x="6" y="5" width="20" height="24" rx="4.5" style={f('gold-lip')} />
      <rect x="6" y="3" width="20" height="24" rx="4.5" style={f('gold')} />
      <rect x="10.5" y="9" width="11" height="2.5" rx="1.25" style={f('gold-lip')} />
      <rect x="10.5" y="14" width="11" height="2.5" rx="1.25" style={f('gold-lip')} />
      <rect x="10.5" y="19" width="7" height="2.5" rx="1.25" style={f('gold-lip')} />
    </>
  ),
  engine: (
    <>
      <rect x="15" y="4" width="2.5" height="6" rx="1.25" style={f('ink-muted')} />
      <circle cx="16.25" cy="4.5" r="2.5" style={f('brand')} />
      <rect x="5" y="11" width="22" height="17" rx="6" style={f('ink-muted')} />
      <rect x="5" y="9" width="22" height="17" rx="6" style={f('ink')} />
      <circle cx="11.5" cy="17" r="2.6" style={f('brand')} />
      <circle cx="20.5" cy="17" r="2.6" style={f('brand')} />
    </>
  ),
  lock: (
    <>
      <path d="M10.5 15v-4a5.5 5.5 0 0 1 11 0v4" style={{ fill: 'none', stroke: 'var(--ink-muted)', strokeWidth: 3.2 }} />
      <rect x="7" y="16" width="18" height="13" rx="4" style={f('lip')} />
      <rect x="7" y="14" width="18" height="13" rx="4" style={f('line')} />
      <circle cx="16" cy="20.5" r="2.2" style={f('ink-muted')} />
    </>
  ),
  check: (
    <>
      <circle cx="16" cy="17" r="12.5" style={f('brand-lip')} />
      <circle cx="16" cy="15" r="12.5" style={f('brand')} />
      <path d="M10 15.5l4 4 8-8" style={{ fill: 'none', stroke: 'var(--on-brand)', strokeWidth: 3.5, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
    </>
  ),
  star: (
    <>
      <path
        transform="translate(0 2)"
        style={{ fill: 'var(--gold-lip)', stroke: 'var(--gold-lip)', strokeWidth: 2.5, strokeLinejoin: 'round' }}
        d="M16 3.5l3.8 7.7 8.5 1.2-6.2 6 1.5 8.4L16 22.8l-7.6 4 1.5-8.4-6.2-6 8.5-1.2z"
      />
      <path
        style={{ fill: 'var(--gold)', stroke: 'var(--gold)', strokeWidth: 2.5, strokeLinejoin: 'round' }}
        d="M16 3.5l3.8 7.7 8.5 1.2-6.2 6 1.5 8.4L16 22.8l-7.6 4 1.5-8.4-6.2-6 8.5-1.2z"
      />
    </>
  ),
  crown: (
    <>
      <path
        transform="translate(0 2)"
        style={{ fill: 'var(--gold-lip)', stroke: 'var(--gold-lip)', strokeWidth: 2, strokeLinejoin: 'round' }}
        d="M5 10l6 5 5-9 5 9 6-5-2.5 15h-17z"
      />
      <path style={{ fill: 'var(--gold)', stroke: 'var(--gold)', strokeWidth: 2, strokeLinejoin: 'round' }} d="M5 10l6 5 5-9 5 9 6-5-2.5 15h-17z" />
      <circle cx="16" cy="18" r="2.2" style={f('gold-lip')} />
    </>
  ),
} satisfies Record<string, ReactNode>

export type Glyph = keyof typeof GLYPHS
export const GLYPH_NAMES = Object.keys(GLYPHS) as Glyph[]

/**
 * Knightly's own icons: chunky two-tone shapes on a ledge, for navigation, the path and the
 * big moments. Everything else (buttons, inline controls) uses Phosphor. Decorative by
 * default; pass `title` when the icon carries meaning on its own.
 */
export function KnIcon({ glyph, title, className }: { glyph: Glyph; title?: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('size-8 shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {GLYPHS[glyph]}
    </svg>
  )
}
