import { useMemo } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { Confetti } from '@/components/confetti'
import { LogoLoader } from '@/components/logo'
import { KnIcon } from '@/components/kn-icon'
import { MoveBadge } from '@/components/move-badge'
import { MoveText } from '@/components/move-text'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { CountUp } from '@/components/ui/count-up'
import { StatLabel, StatValue } from '@/components/ui/stat'
import { type GameDetail, useApi } from '@/lib/api'
import { type StepMark, bestMoment, keyMoments, moveLabel } from '@/lib/key-moments'
import { timeControl } from '@/lib/format'
import { cn } from '@/lib/utils'

const MARK: Record<StepMark, { className: string; label: string }> = {
  found: { className: 'bg-brand', label: 'found' },
  missed: { className: 'bg-danger', label: 'missed' },
  praise: { className: 'bg-gold', label: 'a great move' },
  seen: { className: 'bg-foreground/25', label: 'looked at' },
}

/**
 * "Review complete!": what the game came down to, once you've walked through it. Your
 * accuracy, a mark per lesson step (found, missed, a great move), your best moment, and the
 * moves to fix, which are in your review deck. Confetti only on arriving from Finish review,
 * never when the page is opened again later.
 */
export function ReviewDonePage() {
  const { id } = useParams()
  const celebrate = !!(useLocation().state as { celebrate?: boolean } | null)?.celebrate
  const { data: game, error } = useApi<GameDetail>(`/api/games/${id}`)
  const me = game?.color ?? 'white'
  const opponent = (me === 'white' ? game?.black : game?.white) ?? ''
  const summary = useMemo(() => {
    if (!game) return null
    const moments = keyMoments(game.plies, me, opponent)
    const fix = game.plies.filter((m) => m.color === me && (m.classification === 'blunder' || m.classification === 'miss' || m.classification === 'mistake'))
    const inDeck = new Set(game.deck_plies)
    // How each lesson step went, saved with the review.
    const marks = game.review_marks.map((m) => ({ ...m, san: game.san[m.ply - 1] ?? '' }))
    return { best: bestMoment(game.plies, me, moments), fix, inDeck: fix.filter((m) => inDeck.has(m.ply)).length, marks }
  }, [game, me, opponent])

  if (error) return <p className="text-sm text-destructive">Couldn't load this game. {error}</p>
  if (!game || !summary) return <LogoLoader label="Adding it up…" />

  const result = game.outcome === 'win' ? 'won' : game.outcome === 'loss' ? 'lost' : 'drawn'
  const { best, fix, inDeck, marks } = summary
  const asked = marks.filter((m) => m.mark === 'found' || m.mark === 'missed')
  const missed = asked.filter((m) => m.mark === 'missed')
  const rise = (order: number) => ({ animationDelay: `calc(var(--duration-celebrate) * 0.5 + ${order} * 80ms)` })

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-7 py-6 text-center">
      <div className="relative grid size-40 place-items-center">
        <span className="absolute inset-0 rounded-full bg-gold/25" />
        {celebrate && <Confetti />}
        <span className={celebrate ? 'animate-bounce-in' : undefined}>
          <KnIcon glyph="trophy" className="size-26" />
        </span>
      </div>

      <div className="animate-rise [animation-delay:calc(var(--duration-celebrate)*0.4)]">
        <h1 className="text-4xl font-bold sm:text-5xl">Review complete!</h1>
        <p className="mt-2 text-muted-foreground">
          vs {opponent} · {timeControl(game.time_control)} · {result}
        </p>
      </div>

      {marks.length > 0 && (
        <Card className="w-full animate-rise gap-2.5 px-5 text-left [animation-delay:calc(var(--duration-celebrate)*0.45)]">
          <div className="flex items-baseline justify-between gap-3">
            <p className="eyebrow">Key moments, one by one</p>
            {asked.length > 0 && (
              <span className="shrink-0 font-heading text-2xl font-bold whitespace-nowrap">
                {asked.length - missed.length} of {asked.length} found
              </span>
            )}
          </div>
          <div className="flex gap-1.5">
            {marks.map((m) => (
              <span
                key={m.ply}
                role="img"
                aria-label={`${moveLabel(m.ply, m.san)}: ${MARK[m.mark].label}`}
                className={cn('h-3.5 flex-1 rounded-full', MARK[m.mark].className)}
              />
            ))}
          </div>
          {asked.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {missed.length
                ? `Missed: ${missed.map((m) => moveLabel(m.ply, m.san)).join(', ')}. Practice brings these back sooner.`
                : 'You found every one.'}
            </p>
          )}
        </Card>
      )}

      <div className="grid w-full gap-4 text-left sm:grid-cols-3">
        <Card size="sm" className="animate-rise" style={rise(0)}>
          <CardHeader>
            <StatLabel>Accuracy</StatLabel>
            <StatValue className="mt-1 text-3xl">
              {game.accuracy != null ? <CountUp value={game.accuracy} decimals={1} /> : '–'}
            </StatValue>
          </CardHeader>
        </Card>
        {best && (
          <Card size="sm" className="animate-rise" style={rise(1)}>
            <CardHeader>
              <StatLabel>Best moment</StatLabel>
              <div className="mt-1 flex items-center gap-2.5">
                <MoveBadge kind={best.kind} className="size-7 text-sm [&_svg]:size-4" />
                <span className="font-heading text-2xl font-bold">
                  <MoveText ply={best.ply} san={game.san[best.ply - 1]} number />
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{best.note}</p>
            </CardHeader>
          </Card>
        )}
        <Card size="sm" className="animate-rise" style={rise(2)}>
          <CardHeader>
            <StatLabel>To fix</StatLabel>
            <div className="mt-1 flex items-center gap-2.5">
              {fix.length > 0 && <MoveBadge kind="blunder" className="size-7 text-sm" />}
              <span className="font-heading text-3xl font-bold">
                <CountUp value={fix.length} />
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {fix.length === 0 ? (
                'A clean game: nothing big to fix.'
              ) : (
                <>
                  {fix.map((m, i) => (
                    <span key={m.ply}>
                      {i > 0 && ', '}
                      <MoveText ply={m.ply} san={m.san} number />
                    </span>
                  ))}
                  .{' '}
                  {inDeck === fix.length
                    ? 'All in your review deck.'
                    : inDeck > 0
                      ? `${inDeck} added to your review deck.`
                      : 'No single move fixes these, so they stay out of your deck.'}
                </>
              )}
            </p>
          </CardHeader>
        </Card>
      </div>

      <div className="flex w-full flex-wrap justify-between gap-3 border-t-2 pt-5">
        <Button asChild variant="outline" size="lg">
          <Link to="/">Back home</Link>
        </Button>
        <Button asChild size="lg">
          <Link to="/practice">Review today's positions</Link>
        </Button>
      </div>
    </div>
  )
}
