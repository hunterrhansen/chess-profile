import { useCountUp } from '@/lib/motion'

/** A number that counts up to its value when it first shows and when it changes (a stat, a
 * score, a count). The final text is what screen readers get. Pair with `tabular-nums` so the
 * width holds still while it counts. */
export function CountUp({
  value,
  decimals = 0,
  from = 0,
  format,
}: {
  value: number
  decimals?: number
  from?: number
  /** Formats the number while counting, e.g. (n) => `${n}%`. */
  format?: (n: string) => string
}) {
  const shown = useCountUp(value, { from })
  const text = (n: number) => (format ? format(n.toFixed(decimals)) : n.toFixed(decimals))
  return (
    <>
      <span aria-hidden>{text(shown)}</span>
      <span className="sr-only">{text(value)}</span>
    </>
  )
}

/** CountUp for a value that's already formatted ("87.4", "45%", "1,203"): counts the first
 * number in it and keeps the rest of the text and its decimals. */
export function CountUpText({ text }: { text: string }) {
  const m = text.match(/-?[\d,]*\.?\d+/)
  const n = m ? Number(m[0].replace(/,/g, '')) : NaN
  if (!m || Number.isNaN(n)) return <>{text}</>
  const decimals = m[0].split('.')[1]?.length ?? 0
  const grouped = m[0].includes(',')
  const [before, after] = [text.slice(0, m.index), text.slice(m.index! + m[0].length)]
  return (
    <CountUp
      value={n}
      decimals={decimals}
      format={(s) => before + (grouped ? Number(s).toLocaleString('en-US', { minimumFractionDigits: decimals }) : s) + after}
    />
  )
}
