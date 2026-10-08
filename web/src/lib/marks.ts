/** How one position or key moment went: found, a good move, found with help, missed, a great
 * move (a review's gold step), or just looked at. Each with its color and words (MarkRow). */
export type Mark = 'found' | 'good' | 'helped' | 'missed' | 'praise' | 'seen'

export const MARKS: Record<Mark, { className: string; label: string }> = {
  found: { className: 'bg-brand', label: 'found' },
  good: { className: 'bg-[color-mix(in_srgb,var(--brand)_50%,var(--card))]', label: 'a good move' },
  helped: { className: 'bg-sky', label: 'found with help' },
  missed: { className: 'bg-danger', label: 'missed' },
  praise: { className: 'bg-gold', label: 'a great move' },
  seen: { className: 'bg-foreground/25', label: 'looked at' },
}

