import { Link } from 'react-router'
import { KnIcon, type Glyph } from '@/components/kn-icon'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** The lead unit on Home: a brand band with its goal and how far its check has got. */
export function UnitBanner({
  title,
  goal,
  progress,
  progressText,
  as: Title = 'h2',
}: {
  title: string
  goal: string
  /** 0 to 1: the unit check's hits over its size. */
  progress: number
  progressText: string
  as?: 'h1' | 'h2' | 'h3'
}) {
  return (
    <div className="rounded-xl bg-brand px-5 py-4 text-on-brand shadow-[0_4px_0_var(--brand-lip)]">
      <p className="text-[13px] font-extrabold tracking-[.06em] uppercase opacity-80">Unit 1 · Your main focus</p>
      <Title className="mt-0.5 font-heading text-2xl font-bold">{title}</Title>
      <p className="mt-1">{goal}</p>
      <div className="mt-3 flex items-center gap-2.5">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-brand-lip">
          <div
            className="h-full rounded-full bg-on-brand transition-[width] duration-(--duration-fill)"
            style={{ width: `${Math.max(4, progress * 100)}%` }}
          />
        </div>
        <span className="text-[13px] font-extrabold">{progressText}</span>
      </div>
    </div>
  )
}

/** A unit whose target was just hit: a gold band with the trophy, shown once. */
export function UnitComplete({ title, children, className }: { title: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-4 rounded-xl bg-gold px-5 py-4 text-on-gold shadow-[0_4px_0_var(--gold-lip)]', className)}>
      <KnIcon glyph="trophy" className="size-14" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-extrabold tracking-[.06em] uppercase">Unit complete</p>
        <p className="font-heading text-xl font-bold">{title}</p>
        {children && <p className="text-sm">{children}</p>}
      </div>
    </div>
  )
}

/** The current path step's card, opened from its node: what it is, and the button to start. */
export function LessonCard({
  eyebrow,
  title,
  body,
  cta,
  to,
  quiet,
  className,
}: {
  eyebrow: string
  title: string
  body: string
  cta: string
  to: string
  /** An outline button, for a step that's optional today. */
  quiet?: boolean
  className?: string
}) {
  return (
    <Card className={cn('w-full max-w-sm gap-3 border-brand px-5 text-left shadow-[0_4px_0_var(--brand-lip)]', className)}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="font-heading text-xl font-semibold">{title}</h2>
      <p className="text-muted-foreground">{body}</p>
      <Button asChild size="lg" variant={quiet ? 'outline' : 'default'} className="w-full">
        <Link to={to}>{cta}</Link>
      </Button>
    </Card>
  )
}

/** Today's goal: the goal icon and title over its bars (`Progress`), buttons and a note. */
export function GoalCard({ children }: { children: React.ReactNode }) {
  return (
    <Card className="gap-3.5 px-5">
      <div className="flex items-center gap-3">
        <KnIcon glyph="goal" className="size-9" />
        <h2 className="font-heading text-xl font-semibold">Today's goal</h2>
      </div>
      {children}
    </Card>
  )
}

/** Today's goal, done: the gold card with the trophy. */
export function GoalDone({ children }: { children: React.ReactNode }) {
  return (
    <Card className="items-center gap-2.5 border-gold-lip bg-gold px-5 text-center text-on-gold shadow-[0_4px_0_var(--gold-lip)]">
      <KnIcon glyph="trophy" className="size-16 animate-pop" />
      <h2 className="font-heading text-2xl font-bold">Today's goal done!</h2>
      <p className="text-sm">{children}</p>
    </Card>
  )
}

/** A count in the phone top bar (`PhoneHeader`): today's game, the positions left. */
export function PhoneCounter({ to, glyph, label, children }: { to: string; glyph: Glyph; label: string; children: React.ReactNode }) {
  return (
    <Link to={to} aria-label={label} className="flex h-11 items-center gap-1 rounded-md px-2 text-[15px] font-extrabold tabular-nums">
      <KnIcon glyph={glyph} className={glyph === 'drill' ? 'size-6' : 'size-[26px]'} />
      {children}
    </Link>
  )
}
