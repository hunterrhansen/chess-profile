import {
  ArrowCounterClockwiseIcon,
  ArrowRightIcon,
  ArrowUUpLeftIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  CircleNotchIcon,
  FlagIcon,
  FunnelIcon,
  LightbulbIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  RobotIcon,
  SpeakerHighIcon,
  StarIcon,
  XIcon,
} from '@phosphor-icons/react'
import { type ReactNode, useState } from 'react'
import { Board, type BoardArrow } from '@/components/board'
import { Confetti } from '@/components/confetti'
import { EmptyState, LoadingBlock } from '@/components/empty-state'
import { EvalBar } from '@/components/eval-bar'
import { GLYPH_NAMES, KnIcon } from '@/components/kn-icon'
import { Logo, LogoMark } from '@/components/logo'
import { ResultBadge } from '@/components/game-bits'
import { MoveBadge } from '@/components/move-badge'
import { Piece, type PieceKind } from '@/components/pieces'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { CountUp, CountUpText } from '@/components/ui/count-up'
import { Progress } from '@/components/ui/progress'
import { StatDelta, StatLabel, StatValue } from '@/components/ui/stat'
import type { Classification } from '@/lib/api'
import { CLASSIFICATION } from '@/lib/classification'
import { BOARDS } from '@/lib/preferences'
import { playSound, type SoundName } from '@/lib/sound'
import { cn } from '@/lib/utils'

/**
 * Every token and component, rendered from the real code: the design system's living
 * reference (docs/design.md has the rules). Flip the theme in Settings to check both.
 */
export function StyleguidePage() {
  return (
    <div className="flex max-w-4xl flex-col gap-10">
      <header>
        <p className="eyebrow">Design system</p>
        <h1 className="mt-1 text-4xl font-semibold">Style guide</h1>
        <p className="mt-2 max-w-prose text-muted-foreground">
          The board is calm, the rewards are loud. Bright fills take dark letters, everything you can press sits on a
          ledge, and gold is for one moment per view.
        </p>
      </header>

      <Block title="Logo" note="LogoMark and Logo in components/logo.tsx; the knight alone (simple) under 24px. The mark also carries the loading and empty states.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="panel flex flex-wrap items-end gap-6 p-6">
            <LogoMark title="Knightly" className="size-28" />
            <LogoMark className="size-16" />
            <LogoMark className="size-8" />
            <LogoMark simple className="size-4" />
          </div>
          <div className="panel flex flex-col justify-center gap-5 p-6">
            <Logo />
            <Logo className="gap-4 [&>span:last-child]:text-4xl" markClassName="size-14" />
          </div>
          <div className="panel flex flex-col gap-4 p-6">
            <h3 className="eyebrow">Loading: LogoLoader, LoadingBlock</h3>
            <LoadingBlock label="Picking today's positions…" className="h-48 rounded-lg" />
          </div>
          <div className="panel flex flex-col gap-2 p-6">
            <h3 className="eyebrow">Empty: EmptyState</h3>
            <EmptyState
              title="No positions yet"
              className="py-4"
              action={<Button variant="outline">Go to Settings</Button>}
            >
              Positions come from your analysed games.
            </EmptyState>
            <EmptyState compact title="No games in this period">
              Try a longer range above.
            </EmptyState>
          </div>
        </div>
      </Block>

      <Block
        title="Icons"
        note="KnIcon (components/kn-icon.tsx) for navigation, the path and the big moments. Phosphor, bold by default (fill for objects), for everything else."
      >
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-5">
          {GLYPH_NAMES.map((g) => (
            <div key={g} className="flex flex-col items-center gap-1.5">
              <KnIcon glyph={g} className="size-12" />
              <code className="font-mono text-xs">{g}</code>
            </div>
          ))}
        </div>
        <Row>
          {[CaretLeftIcon, CaretRightIcon, CheckIcon, XIcon, MagnifyingGlassIcon, ArrowUUpLeftIcon, CircleNotchIcon].map((Icon, i) => (
            <Icon key={i} className="size-6" />
          ))}
          {[RobotIcon, FlagIcon, LightbulbIcon, FunnelIcon, StarIcon].map((Icon, i) => (
            <Icon key={i} weight="fill" className="size-6" />
          ))}
        </Row>
      </Block>

      <Block title="Color" note="Tokens in src/styles/tokens.css. Use them as Tailwind colors (bg-brand) or var(--brand).">
        {COLOR_GROUPS.map(([group, names]) => (
          <div key={group} className="flex flex-col gap-2">
            <h3 className="eyebrow">{group}</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {names.map((n) => (
                <Swatch key={n} name={n} />
              ))}
            </div>
          </div>
        ))}
      </Block>

      <Block title="Type" note="Fredoka for headlines and numbers, Nunito 600+ for text, JetBrains Mono for engine numbers.">
        <div className="panel flex flex-col gap-4 p-5">
          <p className="font-display text-5xl font-bold">Checkmate in three</p>
          <p className="font-display text-4xl font-bold">Your Sicilian is improving</p>
          <p className="font-display text-2xl font-semibold">Key moments</p>
          <p className="text-lg font-extrabold">Why was Nf5 a blunder?</p>
          <p className="max-w-prose">You left the bishop on c4 undefended after castling. Bxc4 wins a piece.</p>
          <p className="text-sm text-muted-foreground">Played 3 days ago · Rapid 10+0</p>
          <p className="eyebrow">Key moment · move 23</p>
          <p className="font-mono text-sm">+1.24 · M3 · −0.38</p>
        </div>
      </Block>

      <Block title="Buttons" note="One default (green) per view. Gold only to claim or celebrate. Press one to see the ledge.">
        <Row>
          <Button>Continue</Button>
          <Button variant="outline">Skip</Button>
          <Button variant="gold">Claim</Button>
          <Button variant="sky">Show line</Button>
          <Button variant="danger">Delete game</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Not now</Button>
          <Button variant="link">A link</Button>
          <Button disabled>Analysing…</Button>
        </Row>
        <Row>
          <Button size="lg">
            <PlayIcon weight="fill" /> Review game
          </Button>
          <Button size="sm">Save</Button>
          <Button size="xs" variant="outline">
            Edit
          </Button>
          <Button size="icon" variant="outline" aria-label="Next">
            <ArrowRightIcon />
          </Button>
        </Row>
      </Block>

      <Block title="Badges" note="The design system's Pill. Results keep ink letters inside a colored outline.">
        <Row>
          <Badge variant="secondary">Rapid</Badge>
          <Badge>Reviewed</Badge>
          <Badge variant="gold">New best</Badge>
          <Badge variant="sky">Opening</Badge>
          <Badge variant="destructive">Main focus</Badge>
          <Badge variant="outline">Not set</Badge>
          <Badge variant="win">W</Badge>
          <Badge variant="loss">L</Badge>
          <Badge variant="draw">D</Badge>
          <ResultBadge outcome="win" />
          <ResultBadge outcome="loss" />
          <ResultBadge outcome="draw" />
        </Row>
      </Block>

      <Block title="Move badges" note="Colors are the --move-* tokens. On the board the badge pops in once per move.">
        <Row>
          {KINDS.map((k) => (
            <span key={k} className="flex items-center gap-2 text-sm font-bold">
              <MoveBadge kind={k} pop className="size-8 text-sm [&_svg]:size-4" />
              {CLASSIFICATION[k].label}
            </span>
          ))}
        </Row>
      </Block>

      <Block title="Progress" note="Brand by default, sky for counts toward a goal, gold for a record.">
        <div className="panel grid max-w-md gap-5 p-5">
          <Progress label="Accuracy" value={87.4} valueText="87.4" />
          <Progress label="Games reviewed this week" value={60} valueText="3 of 5" tone="sky" />
          <Progress label="Personal best" value={100} valueText="94.1" tone="gold" />
          <Progress label="Share analysed" value={72} size="sm" />
        </div>
      </Block>

      <Block title="Stats and cards" note="Cards sit on a 2px ledge; a card that is a link lifts on hover.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <StatLabel>Accuracy</StatLabel>
              <StatValue className="mt-1">
                87.4
                <StatDelta value={3.2} better text="3.2" />
              </StatValue>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <StatLabel>Blunders per game</StatLabel>
              <StatValue className="mt-1">
                2.3
                <StatDelta value={0.4} better={false} text="0.4" />
              </StatValue>
            </CardHeader>
          </Card>
          <a href="#stats" className="panel-link rounded-xl">
            <Card className="h-full">
              <CardHeader>
                <StatLabel>
                  Games analysed <ArrowRightIcon className="size-3.5" />
                </StatLabel>
                <StatValue className="mt-1">404</StatValue>
              </CardHeader>
            </Card>
          </a>
        </div>
      </Block>

      <MotionBlock />

      <BoardBlock />

      <Block title="Eval bar" note="White's share of the win chance; the eval sits on the side that's ahead.">
        <Row>
          <div className="flex h-60 gap-4">
            <EvalBar whiteWin={61} score="1.2" whiteAtBottom />
            <EvalBar whiteWin={46} score="0.4" whiteAtBottom />
            <EvalBar whiteWin={100} score="M3" whiteAtBottom />
            <EvalBar whiteWin={0} score="M2" whiteAtBottom />
          </div>
        </Row>
      </Block>
    </div>
  )
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const BOARD_STATES: { title: string; note: string; props: Omit<React.ComponentProps<typeof Board>, 'palette' | 'orientation'> & { arrows?: BoardArrow[] } }[] = [
  {
    title: 'Review',
    note: 'The last move in yellow with its badge; the better move as a green arrow.',
    props: {
      fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
      lastMove: { from: 'd1', to: 'f3' },
      badge: { square: 'f3', kind: 'inaccuracy' },
      arrows: [{ from: 'g1', to: 'f3', tone: 'best' }],
    },
  },
  {
    title: 'Your turn',
    note: 'The piece you picked up is ringed in sky; dots for moves, rings for captures.',
    props: { fen: START, selected: 'g1', targets: new Set(['f3', 'h3']) },
  },
  {
    title: 'Engine line',
    note: 'Not the game: highlights, frame and arrow turn blue.',
    props: {
      fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
      lastMove: { from: 'b8', to: 'c6' },
      inLine: true,
      arrows: [{ from: 'f1', to: 'b5', tone: 'line' }],
    },
  },
  {
    title: 'Check',
    note: "Shows the attack: the king's square red, the path from the checker tinted.",
    props: { fen: 'rnb1kbnr/pppp1ppp/8/4p3/5PPq/8/PPPPP2P/RNBQKBNR w KQkq - 1 3', lastMove: { from: 'd8', to: 'h4' } },
  },
  {
    title: 'Knight check',
    note: "No path to show: just the king's square and the knight's.",
    props: { fen: 'r1bqkbnr/pppp1ppp/8/4p3/4P3/3n4/PPPP1PPP/RNBQKBNR w KQkq - 0 4', lastMove: { from: 'c5', to: 'd3' } },
  },
  {
    title: 'Danger',
    note: 'The reply that punishes a move, as a red arrow (blunder check).',
    props: {
      fen: 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 3',
      arrows: [{ from: 'f6', to: 'e4', tone: 'danger' }],
    },
  },
]

/** The board in each of its states, with the piece set. */
function BoardBlock() {
  return (
    <Block
      title="Board"
      note="Board (components/board.tsx) everywhere a position is shown: Knightly's pieces on the Sage board, on a 4px ledge."
    >
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
        {BOARD_STATES.map(({ title, note, props }) => (
          <div key={title} className="flex flex-col gap-2">
            <Board palette={BOARDS.sage} orientation="white" className="flex-none" {...props} />
            <div className="mt-2">
              <h3 className="font-heading text-lg font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground">{note}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="panel flex flex-wrap justify-center gap-2 p-4">
        {(['w', 'b'] as const).flatMap((side) =>
          (['k', 'q', 'r', 'b', 'n', 'p'] as PieceKind[]).map((kind) => (
            <div key={side + kind} className="size-14">
              <Piece kind={kind} side={side} />
            </div>
          )),
        )}
      </div>
    </Block>
  )
}

const DURATIONS = ['press', 'quick', 'move', 'pop', 'sheet', 'fill', 'celebrate'] as const
const EASINGS = [
  ['ease-out', 'Arriving, filling. The default.'],
  ['ease-move', 'A piece sliding: in and out, like a hand.'],
  ['ease-bounce', 'Rewards and unlocks: overshoots once.'],
  ['ease-in', 'Leaving.'],
] as const

const SOUND_GROUPS: [string, [SoundName, string][]][] = [
  ['Board', [['move', 'Move'], ['capture', 'Capture'], ['check', 'Check'], ['castle', 'Castle'], ['promote', 'Promote']]],
  ['Answers', [['right', 'Right'], ['wrong', 'Wrong'], ['brilliant', 'Brilliant']]],
  ['Moments', [['gameStart', 'Game start'], ['checkmate', 'Checkmate'], ['win', 'Game won'], ['gameOver', 'Game over'], ['celebrate', 'Celebrate']]],
]

/** The motion tokens and every animation, each one replayable. */
function MotionBlock() {
  const [take, setTake] = useState(0) // bump to replay everything
  const [done, setDone] = useState(3)
  const [party, setParty] = useState(0)
  return (
    <Block
      title="Motion and sound"
      note="Quick for small things, bouncy for rewards, never in the way. Reduced motion keeps the end state and drops the movement. Sounds land with their animation."
    >
      <Row>
        <Button variant="outline" onClick={() => setTake((t) => t + 1)}>
          <ArrowCounterClockwiseIcon /> Replay all
        </Button>
      </Row>

      <div className="grid gap-4 sm:grid-cols-2">
        <Demo title="Durations" note="--duration-*. The bar runs for each one.">
          <div key={take} className="grid gap-1.5">
            {DURATIONS.map((d) => (
              <div key={d} className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
                <code className="font-mono text-xs">{d}</code>
                <span className="h-2 overflow-hidden rounded-full bg-surface-muted">
                  <span
                    className="block h-full origin-left animate-[grow_var(--d)_var(--ease-out)_both] rounded-full bg-brand"
                    style={{ '--d': `var(--duration-${d})` } as React.CSSProperties}
                  />
                </span>
              </div>
            ))}
          </div>
        </Demo>

        <Demo title="Easings" note="--ease-*. Same distance, same time.">
          <div key={take} className="grid gap-2">
            {EASINGS.map(([e, what]) => (
              <div key={e} className="grid gap-0.5">
                <span className="flex justify-between text-xs">
                  <code className="font-mono">{e}</code>
                  <span className="text-muted-foreground">{what}</span>
                </span>
                <span className="relative h-3 rounded-full bg-surface-muted">
                  <span
                    className="absolute top-0 left-0 size-3 animate-[slide_900ms_var(--e)_both] rounded-full bg-sky"
                    style={{ '--e': `var(--${e})` } as React.CSSProperties}
                  />
                </span>
              </div>
            ))}
          </div>
        </Demo>

        <Demo title="Badge lands" note="animate-pop, after the piece. Brilliant and Great send a ring out.">
          <div key={take} className="flex items-center gap-4">
            {(['brilliant', 'great', 'best', 'mistake', 'blunder'] as const).map((k) => (
              <MoveBadge key={k} kind={k} pop className="size-9 text-base [&_svg]:size-5" />
            ))}
          </div>
        </Demo>

        <Demo title="Square flash" note="animate-flash on the square you moved to: green for right, red for wrong.">
          <div key={take} className="flex gap-3">
            {(['right', 'wrong'] as const).map((tone) => (
              <span key={tone} className="relative size-16 overflow-hidden rounded-sm bg-board-dark">
                <span
                  className={cn(
                    'absolute inset-0 animate-flash [animation-delay:var(--duration-move)]',
                    tone === 'right' ? 'bg-brand/70' : 'bg-danger/70',
                  )}
                />
              </span>
            ))}
          </div>
        </Demo>

        <Demo title="Verdict" note="animate-sheet slides it up; the mark bounces in when right, shakes once when wrong.">
          <div key={take} className="grid gap-2">
            {[true, false].map((right) => (
              <div
                key={String(right)}
                className={cn(
                  'panel flex animate-sheet items-center gap-3 p-3',
                  right ? 'border-brand bg-brand/15' : 'border-danger bg-danger/15',
                )}
              >
                <span
                  className={cn(
                    'grid size-8 shrink-0 place-items-center rounded-full [animation-delay:calc(var(--duration-sheet)*0.6)]',
                    right ? 'animate-bounce-in bg-brand text-on-brand' : 'animate-shake bg-danger text-on-danger',
                  )}
                >
                  {right ? <CheckIcon className="size-5" /> : <XIcon className="size-5" />}
                </span>
                <span className={cn('font-heading text-lg font-semibold', right ? 'text-brand-text' : 'text-danger-text')}>
                  {right ? 'Found it: Rxh7+' : 'The move was Rxh7+'}
                </span>
              </div>
            ))}
          </div>
        </Demo>

        <Demo title="Progress and counts" note="The fill eases and lights up when it grows; the count bumps.">
          <div className="grid gap-3">
            <div className="flex items-center gap-3">
              <Progress className="flex-1" label="Today's positions" hideLabel value={(done / 10) * 100} />
              <span key={done} className="animate-bump text-sm font-extrabold tabular-nums">
                {done} of 10
              </span>
            </div>
            <Row>
              <Button size="sm" variant="outline" onClick={() => setDone((d) => (d >= 10 ? 0 : d + 1))}>
                Answer one
              </Button>
            </Row>
          </div>
        </Demo>

        <Demo title="Numbers count up" note="CountUp and CountUpText; the change rises in after, or floats off (animate-float-up).">
          <div key={take} className="flex items-end gap-6">
            <StatValue>
              <CountUpText text="87.4" />
              <StatDelta value={3.2} better text="3.2" />
            </StatValue>
            <StatValue className="relative text-3xl">
              <CountUp value={652} />
              <span className="absolute -top-4 right-0 animate-float-up font-sans text-sm font-extrabold text-brand-text [animation-delay:var(--duration-fill)]">
                +12
              </span>
            </StatValue>
          </div>
        </Demo>

        <Demo title="Start here" note="animate-beacon: the only loop. Just the current step, never decoration.">
          <div className="flex items-center gap-6 py-2">
            <span className="grid size-14 place-items-center rounded-full bg-surface-muted text-ink-muted shadow-[0_4px_0_var(--line)]">
              <CheckIcon className="size-6" />
            </span>
            <span className="grid size-14 animate-beacon place-items-center rounded-full bg-brand text-on-brand shadow-[0_4px_0_var(--brand-lip)] [--beacon:var(--brand)]">
              <StarIcon weight="fill" className="size-6" />
            </span>
          </div>
        </Demo>

        <Demo
          title="Sounds"
          note="Made in the browser, no files. Each plays as its animation lands; Settings turns them off."
          className="sm:col-span-2"
        >
          <div className="grid gap-3">
            {SOUND_GROUPS.map(([group, names]) => (
              <div key={group} className="flex flex-wrap items-center gap-2">
                <span className="eyebrow w-20">{group}</span>
                {names.map(([name, label]) => (
                  <Button key={name} size="sm" variant="outline" onClick={() => playSound(name)}>
                    <SpeakerHighIcon weight="fill" /> {label}
                  </Button>
                ))}
              </div>
            ))}
          </div>
        </Demo>

        <Demo
          title="Celebrate"
          note="Confetti and animate-bounce-in. The big moments only: one per view, never on a loop."
          className="sm:col-span-2"
        >
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="relative">
              {party > 0 && <Confetti key={`confetti-${party}`} seed={party} />}
              <span
                key={party}
                className="grid size-20 animate-bounce-in place-items-center rounded-full bg-gold text-on-gold shadow-[0_6px_0_var(--gold-lip)]"
              >
                <CheckIcon className="size-10" />
              </span>
            </div>
            <Button variant="gold" onClick={() => setParty((p) => p + 1)}>
              Celebrate
            </Button>
          </div>
        </Demo>
      </div>
    </Block>
  )
}

function Demo({ title, note, className, children }: { title: string; note: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('panel flex flex-col gap-3 p-5', className)}>
      <div>
        <h3 className="font-heading text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{note}</p>
      </div>
      {children}
    </div>
  )
}

const KINDS: Classification[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder', 'miss']

const COLOR_GROUPS: [string, string[]][] = [
  ['Surfaces and text', ['page', 'surface', 'surface-muted', 'line', 'lip', 'ink', 'ink-muted', 'focus']],
  ['Brand and accents', ['brand', 'brand-lip', 'on-brand', 'brand-text', 'gold', 'gold-lip', 'on-gold', 'gold-text']],
  ['More accents', ['sky', 'sky-lip', 'on-sky', 'danger', 'danger-lip', 'on-danger', 'danger-text']],
  ['Chess', ['board-light', 'board-dark', 'board-highlight-light', 'board-highlight-dark', 'line-highlight-light', 'line-highlight-dark', 'selected', 'move-hint']],
  ['Arrows and check', ['arrow-best', 'arrow-line', 'arrow-danger', 'check', 'check-path', 'eval-white', 'eval-black']],
  ['Pieces (same in both themes)', ['piece-white', 'piece-white-shade', 'piece-black', 'piece-black-shade', 'piece-black-detail', 'piece-black-eye', 'piece-outline', 'piece-black-outline']],
  ['Results', ['win', 'loss', 'draw']],
  ['Move classifications', KINDS.map((k) => `move-${k}`)],
]

function Swatch({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="size-10 shrink-0 rounded-md ring-2 ring-line" style={{ background: `var(--${name})` }} />
      <code className="min-w-0 truncate font-mono text-xs">{name}</code>
    </div>
  )
}

function Block({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section id={title.toLowerCase().split(' ')[0]} className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{note}</p>
      </div>
      {children}
    </section>
  )
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>
}
