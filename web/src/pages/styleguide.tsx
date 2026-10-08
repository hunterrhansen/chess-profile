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
  MagnifyingGlassIcon,
  PlayIcon,
  RobotIcon,
  SpeakerHighIcon,
  StarIcon,
  XIcon,
} from '@phosphor-icons/react'
import { type ReactNode, useState } from 'react'
import { Avatar } from '@/components/account-status'
import { NavItem } from '@/components/app-shell'
import { Board, type BoardArrow } from '@/components/board'
import { Confetti } from '@/components/confetti'
import { EmptyState, LoadingBlock } from '@/components/empty-state'
import { EvalBar } from '@/components/eval-bar'
import { FindBar } from '@/components/find-bar'
import { GLYPH_NAMES, KnIcon } from '@/components/kn-icon'
import { Logo, LogoMark } from '@/components/logo'
import { ResultBadge } from '@/components/game-bits'
import { LessonBar, LessonBoard, LessonVerdict } from '@/components/lesson-bar'
import { MoveBadge } from '@/components/move-badge'
import { MoveText } from '@/components/move-text'
import { PathNode } from '@/components/path-node'
import { Piece, type PieceKind } from '@/components/pieces'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { CountUp, CountUpText } from '@/components/ui/count-up'
import { Progress } from '@/components/ui/progress'
import { StatDelta, StatLabel, StatValue } from '@/components/ui/stat'
import { Switch } from '@/components/ui/switch'
import type { Classification, DeckAnswer, Game } from '@/lib/api'
import { CLASSIFICATION } from '@/lib/classification'
import type { FindMove } from '@/lib/find-move'
import type { KeyMoment } from '@/lib/key-moments'
import { BOARDS } from '@/lib/preferences'
import type { Replay } from '@/lib/replay'
import { playSound, type SoundName } from '@/lib/sound'
import { cn } from '@/lib/utils'
import { GameRow } from '@/pages/games'
import { BlunderWarning, BotSays } from '@/pages/play'
import { WinGraph } from '@/pages/review-moves'
import { Segmented, Row as SettingRow, Section as SettingsSection } from '@/pages/settings'

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
        note="KnIcon (components/kn-icon.tsx) for navigation, the path and the big moments; hint is the gold bulb on every Hint button. Phosphor, bold by default (fill for objects), for everything else."
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
          {[RobotIcon, FlagIcon, FunnelIcon, StarIcon].map((Icon, i) => (
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

      <SpacingBlock />

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

      <Block title="Progress" note="Tone brand by default, sky for counts toward a goal (positions, games this week), gold for a record or a finished goal.">
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

      <NavigationBlock />

      <HomeBlock />

      <LessonBlock />

      <MarksBlock />

      <PlayBlock />

      <SettingsBlock />

      <GamesBlock />

      <UnitCardsBlock />

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

      <WinGraphBlock />

      <Block title="Notation" note="MoveText (components/move-text.tsx): figurine notation, the piece drawn in the text color. Outlined for White, filled for Black.">
        <div className="panel flex flex-wrap items-center gap-x-6 gap-y-2 p-5 text-lg">
          <MoveText ply={19} san="Nf5" number />
          <MoveText ply={58} san="Qxc8" number />
          <MoveText ply={41} san="Rxh7+" number />
          <MoveText ply={42} san="Kxh7" number />
          <MoveText ply={1} san="e4" number />
          <span className="text-sm text-muted-foreground">
            In a sentence: <MoveText ply={0} san="Bxd4" side="white" /> wins a pawn.
          </span>
        </div>
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
  ['Moments', [['win', 'Game won'], ['gameOver', 'Game over'], ['celebrate', 'Celebrate']]],
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

/* ---------------------------------------------------------------------------------------
 * The app's patterns: real components with static example props (no API calls). Where a
 * pattern is laid out inline in its page, the demo copies its markup and says so.
 * ------------------------------------------------------------------------------------- */

const SPACES = [1, 2, 3, 4, 6, 8, 12] as const
const RADII = [
  ['rounded-sm', '8px', 'Swatches, chips', 'rounded-sm'],
  ['board', '10px', 'The board', 'rounded-[10px]'],
  ['rounded-md', '12px', 'Pills, rows, tabs', 'rounded-md'],
  ['rounded-lg', '16px', 'Buttons', 'rounded-lg'],
  ['rounded-xl', '24px', 'Cards, panels', 'rounded-xl'],
  ['rounded-full', 'pill', 'Bars, dots, avatars', 'rounded-full'],
] as const

/** Tailwind's 4px steps, the ones the design uses, and the corners. */
function SpacingBlock() {
  return (
    <Block
      title="Spacing and corners"
      note="Tailwind's 4px steps; the scale is 1, 2, 3, 4, 6, 8, 12 (4 to 48px). Radii are set in index.css; depth is always a ledge."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="panel flex flex-col gap-2 p-5">
          {SPACES.map((n) => (
            <div key={n} className="grid grid-cols-[4rem_3rem_1fr] items-center gap-2">
              <code className="font-mono text-xs">gap-{n}</code>
              <span className="text-xs text-muted-foreground tabular-nums">{n * 4}px</span>
              <span className="h-3 rounded-[4px] bg-sky" style={{ width: `calc(var(--spacing) * ${n * 3})` }} />
            </div>
          ))}
        </div>
        <div className="panel grid grid-cols-3 gap-4 p-5">
          {RADII.map(([name, px, use, cls]) => (
            <div key={name} className="flex flex-col items-center gap-1 text-center">
              <span className={cn('size-14 border-2 border-line bg-card shadow-[0_2px_0_var(--lip)]', cls)} />
              <code className="font-mono text-[11px] whitespace-nowrap">{name}</code>
              <span className="text-[11px] text-muted-foreground">
                {px} · {use}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Block>
  )
}

// The same dot and line colors as components/account-status.tsx.
const SYNC = [
  ['ok', 'Synced 6:15 AM', 'bg-brand', 'text-muted-foreground'],
  ['running', 'Updating…', 'bg-sky animate-pulse', 'text-muted-foreground'],
  ['idle', 'Synced yesterday', 'bg-border', 'text-muted-foreground'],
  ['partial', 'Synced, with problems', 'bg-gold', 'text-gold-text'],
  ['failed', 'Update failed', 'bg-danger', 'text-danger-text'],
] as const

/** The sidebar tabs, the phone's bars, and the account row. */
function NavigationBlock() {
  return (
    <Block
      title="Navigation"
      note="NavItem (components/app-shell.tsx): KnIcon and an uppercase label, the current tab outlined in sky; collapsed, an icon rail. On a phone the tabs run along the bottom, and the top bar carries today's goal counters."
    >
      <div className="flex flex-wrap items-start gap-4">
        <div className="panel flex w-60 flex-col gap-1.5 bg-sidebar p-2.5">
          <NavItem to="/styleguide" active label="Home" glyph="home" labelClass="inline" />
          <NavItem to="/styleguide" active={false} label="Games" glyph="games" labelClass="inline" />
          <NavItem to="/styleguide" active={false} label="Play" glyph="play" labelClass="inline" />
          <NavItem to="/styleguide" active={false} label="Progress" glyph="progress" labelClass="inline" />
        </div>
        <div className="panel flex w-20 flex-col gap-1.5 bg-sidebar p-2.5">
          <NavItem to="/styleguide" active label="Home" glyph="home" labelClass="hidden" />
          <NavItem to="/styleguide" active={false} label="Games" glyph="games" labelClass="hidden" />
          <NavItem to="/styleguide" active={false} label="Settings" glyph="settings" labelClass="hidden" />
        </div>
        <div className="flex w-full max-w-sm flex-col gap-4">
          {/* Copies the phone bars' markup in app-shell.tsx and home.tsx. */}
          <div className="panel flex h-14 items-center gap-2 px-3">
            <LogoMark className="size-7" />
            <span className="font-display text-xl font-bold text-brand-text">Knightly</span>
            <span className="ml-auto flex h-11 items-center gap-1 px-2 text-[15px] font-extrabold tabular-nums">
              <KnIcon glyph="review" className="size-[26px]" />
              0/1
            </span>
            <span className="flex h-11 items-center gap-1 px-2 text-[15px] font-extrabold tabular-nums">
              <KnIcon glyph="drill" className="size-6" />
              3/10
            </span>
            <span className="grid size-11 place-items-center">
              <KnIcon glyph="settings" className="size-[26px]" />
            </span>
          </div>
          <div className="panel grid grid-cols-4 gap-1 px-2 py-1.5">
            {(['home', 'games', 'play', 'progress'] as const).map((g, i) => (
              <span
                key={g}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] font-extrabold tracking-[.05em] text-muted-foreground uppercase',
                  i === 0 && 'bg-sky/14 text-foreground shadow-[inset_0_0_0_2px_var(--sky)]',
                )}
              >
                <KnIcon glyph={g} className="size-[30px]" />
                {g}
              </span>
            ))}
          </div>
        </div>
      </div>
      <Demo
        title="Account status"
        note="AccountStatus (components/account-status.tsx), at the foot of the sidebar: your avatar wearing a tag per site, and the daily update as a dot and a short line. Collapsed, the dot sits on the avatar. Its menu (Run now, each account's rating, Manage accounts) needs live data, so it isn't shown."
      >
        <div className="grid gap-x-6 gap-y-1 rounded-lg bg-sidebar p-1 lg:grid-cols-2">
          {SYNC.map(([tone, line, dot, text]) => (
            <div key={tone} className="flex items-center gap-3 px-2.5 py-2">
              <Avatar initial="h" sources={['chesscom', 'lichess']} dot={null} />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate font-extrabold">hunter</span>
                <span className={cn('flex items-center gap-1.5 text-xs', text)}>
                  <span className={cn('size-2 shrink-0 rounded-full', dot)} />
                  <span className="truncate">{line}</span>
                </span>
              </span>
              <code className="font-mono text-xs text-muted-foreground">{tone}</code>
            </div>
          ))}
          <div className="flex items-center gap-3 px-2.5 py-2">
            <Avatar initial="h" sources={['chesscom']} dot="failed" />
            <span className="text-sm text-muted-foreground">Collapsed: the dot on the avatar</span>
          </div>
        </div>
      </Demo>
    </Block>
  )
}

/** Home's path: the unit banner, each node, the lesson card and Today's goal. */
function HomeBlock() {
  return (
    <Block
      title="Home path"
      note="PathNode (components/path-node.tsx) for each step: done, current (ringed, a sky tag, the only beacon), locked, the unit check. The banner, lesson card and goal cards are laid out in pages/home.tsx; these copy them."
    >
      <div className="grid gap-4 md:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-5">
          <div className="rounded-xl bg-brand px-5 py-4 text-on-brand shadow-[0_4px_0_var(--brand-lip)]">
            <p className="text-[13px] font-extrabold tracking-[.06em] uppercase opacity-80">Unit 1 · Your main focus</p>
            <h3 className="mt-0.5 font-heading text-2xl font-bold">Stop hanging pieces</h3>
            <p className="mt-1">2.3 blunders a game. Get it under 1.5.</p>
            <div className="mt-3 flex items-center gap-2.5">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-brand-lip">
                <div className="h-full w-3/10 rounded-full bg-on-brand" />
              </div>
              <span className="text-[13px] font-extrabold">3 of 10 games under 1.5</span>
            </div>
          </div>
          <div className="panel flex flex-wrap items-end justify-around gap-6 p-5">
            <PathNode state="done" label="Reviewed today's game" />
            <PathNode state="current" glyph="drill" label="Today's positions" tag="7 left" onClick={() => {}} expanded />
            <PathNode state="locked" glyph="play" label="Play the bot" />
            <PathNode state="check" label="Unit check: under 1.5 blunders over 10 games" />
          </div>
          <Card className="w-full max-w-sm gap-3 self-center border-brand px-5 text-left shadow-[0_4px_0_var(--brand-lip)]">
            <p className="eyebrow">Your review deck · about 5 minutes</p>
            <h3 className="font-heading text-xl font-semibold">Review today's positions</h3>
            <p className="text-muted-foreground">
              7 positions from your own games are due. Found ones come back later and later; misses come back sooner.
            </p>
            <Button size="lg" className="w-full">
              Start
            </Button>
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card className="gap-3.5 px-5">
            <div className="flex items-center gap-3">
              <KnIcon glyph="goal" className="size-9" />
              <h3 className="font-heading text-xl font-semibold">Today's goal</h3>
            </div>
            <Progress label="Today's game" value={100} valueText="1 of 1" />
            <Progress label="Positions to review" tone="sky" value={30} valueText="3 of 10" />
            <Button variant="outline" className="w-full">
              Review positions
            </Button>
          </Card>
          <Card className="items-center gap-2.5 border-gold-lip bg-gold px-5 text-center text-on-gold shadow-[0_4px_0_var(--gold-lip)]">
            <KnIcon glyph="trophy" className="size-16" />
            <h3 className="font-heading text-2xl font-bold">Today's goal done!</h3>
            <p className="text-sm">Game reviewed and 10 positions cleared. The next ones come due tomorrow.</p>
          </Card>
          <div className="flex items-center gap-4 rounded-xl bg-gold px-5 py-4 text-on-gold shadow-[0_4px_0_var(--gold-lip)]">
            <KnIcon glyph="trophy" className="size-14" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold tracking-[.06em] uppercase">Unit complete</p>
              <p className="font-heading text-xl font-bold">Stop hanging pieces</p>
            </div>
          </div>
        </div>
      </div>
    </Block>
  )
}

const MATE_FEN = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'
const ANSWER: DeckAnswer = { correct: true, quality: 'best', rating: 'good', best_uci: 'a1a8', best_san: 'Ra8#', mastered: false, due: null }
const FIND_IDLE = {
  outcome: null,
  first: null,
  playedSan: null,
  misses: 0,
  selected: null,
  checking: false,
  hints: 0,
  rung: null,
  tactic: null,
  nextHint: 'Hint',
  hintReady: true,
  hintPiece: null,
  error: null,
  askHint: () => {},
  showMe: () => {},
}
/** A FindMove frozen in one state, for FindBar (in the app it comes from useFindMove). */
function fakeFind(over: Record<string, unknown>) {
  return { ...FIND_IDLE, ...over } as unknown as FindMove
}
const HINTED = { hints: 1, rung: 'piece', hintPiece: { square: 'a1', type: 'r' }, nextHint: 'Show the move' }

const BAR_STATES: { title: string; note: string; find: FindMove; when?: string }[] = [
  { title: 'Idle', note: 'Hint (live after 2s) and Show me, with a line of help.', find: fakeFind({}) },
  { title: 'Not quite', note: 'retry: after a miss the band goes light red. Try again.', find: fakeFind({ misses: 1 }) },
  { title: 'Hint, step one', note: 'The piece glows gold, the help line turns gold, the button becomes Show the move.', find: fakeFind(HINTED) },
  { title: 'Hint, step two', note: 'The move as a green arrow. No hints left.', find: fakeFind({ hints: 2, rung: 'move', nextHint: null }) },
  {
    title: 'Found it',
    note: 'right: the green band slides up, the check bounces in.',
    find: fakeFind({ outcome: 'found', first: { ...ANSWER, rating: 'easy' }, playedSan: 'Ra8#' }),
    when: 'Back in 9 days.',
  },
  {
    title: 'Good move',
    note: 'right, but not the best.',
    find: fakeFind({ outcome: 'good', first: { ...ANSWER, quality: 'good', rating: 'hard' }, playedSan: 'Re1' }),
    when: 'Back in 3 days.',
  },
  {
    title: 'Found it, with help',
    note: 'Still green: you did find it.',
    find: fakeFind({ outcome: 'helped', first: { ...ANSWER, correct: false, quality: 'wrong', rating: 'again' }, playedSan: 'Ra8#' }),
    when: 'One more go at the end of this session. Then back tomorrow.',
  },
  {
    title: 'The move was…',
    note: 'wrong, after Show me: the red band, the ✕ shakes once.',
    find: fakeFind({ outcome: 'shown', first: { ...ANSWER, correct: false, quality: 'shown', rating: 'again' } }),
    when: 'One more go at the end of this session. Then back tomorrow.',
  },
]

const GRADES = [
  ['found', 'Found it: Ra8#', 'Good; Easy if the best move inside 10s'],
  ['good', 'Good move! Best was Ra8#', 'Hard'],
  ['helped', 'Found it, with help: Ra8#', 'Again'],
  ['shown', 'The move was Ra8#', 'Again'],
] as const

/** Puts a LessonBar, which spans the whole window, inside a demo frame. `narrow` stacks it as
 * on a phone. */
function BarFrame({ narrow, children }: { narrow?: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border-2 border-line [&>footer]:left-0 [&>footer]:w-full [&>footer]:translate-x-0 [&>footer]:border-t-0',
        narrow && 'rounded-none border-x-0 border-b-0 [&>footer>div]:flex-col [&>footer>div]:items-start [&>footer>div]:gap-2 [&>footer>div]:px-3 [&>footer>div]:py-3',
      )}
    >
      {children}
    </div>
  )
}

/** A lesson: the screen, the bar's states, Hint, and how answers are graded. */
function LessonBlock() {
  return (
    <Block
      title="Lesson"
      note="LessonScreen, LessonBoard, LessonBar and LessonVerdict (components/lesson-bar.tsx); FindBar (components/find-bar.tsx) while you find a move. Full screen in FocusShell, never scrolling."
    >
      <div className="grid gap-4 md:grid-cols-[22rem_1fr]">
        <Demo title="Lesson screen" note="Scaled down: ✕, the bar and its count on top, the prompt, the board filling what's left, the bar on the bottom edge.">
          <div className="flex h-[34rem] flex-col gap-3 overflow-hidden rounded-xl border-2 border-line bg-background pt-3">
            <header className="flex items-center gap-2 px-3">
              <Button variant="ghost" size="icon" aria-label="Stop for now">
                <XIcon />
              </Button>
              <Progress className="flex-1" label="Today's positions" hideLabel value={30} />
              <span className="text-sm font-extrabold tabular-nums">3 of 10</span>
            </header>
            <div className="flex flex-col gap-1.5 px-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="sky">New</Badge>
                <Badge variant="secondary">vs woolcap · Oct 5 · move 24</Badge>
              </div>
              <p className="font-heading text-xl leading-tight font-bold">You played Kf1 here. Find a better move.</p>
            </div>
            <div className="flex min-h-0 flex-1 flex-col px-3">
              <LessonBoard>
                <Board palette={BOARDS.sage} orientation="white" fen={MATE_FEN} glow="a1" />
              </LessonBoard>
            </div>
            <BarFrame narrow>
              <FindBar find={fakeFind(HINTED)} onNext={() => {}} />
            </BarFrame>
          </div>
        </Demo>
        <div className="flex flex-col gap-4">
          <Demo
            title="Hint"
            note="Gold, two steps: the piece to move breathes a gold glow (Board glow, animate-hint, looping until you move), then the move as a green arrow. Show me stays separate."
          >
            <div className="grid grid-cols-2 gap-3">
              <Board palette={BOARDS.sage} orientation="white" fen={MATE_FEN} glow="a1" className="flex-none" />
              <Board palette={BOARDS.sage} orientation="white" fen={MATE_FEN} arrows={[{ from: 'a1', to: 'a8', tone: 'best' }]} className="flex-none" />
            </div>
          </Demo>
          <Demo title="Answers and grades" note="Only the first try is graded (deck.py: FSRS, with Anki's buttons pressed for you). Trying again is for learning.">
            <table className="w-full text-left text-sm">
              <thead className="eyebrow">
                <tr>
                  <th className="pr-3 pb-1.5">Outcome</th>
                  <th className="pr-3 pb-1.5">Verdict</th>
                  <th className="pb-1.5">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y-2">
                {GRADES.map(([o, title, grade]) => (
                  <tr key={o}>
                    <td className="py-1.5 pr-3">
                      <code className="font-mono text-xs">{o}</code>
                    </td>
                    <td className={cn('py-1.5 pr-3 font-extrabold', o === 'shown' ? 'text-danger-text' : 'text-brand-text')}>{title}</td>
                    <td className="py-1.5">{grade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Row>
              <Badge variant="sky">New</Badge>
              <Badge variant="sky">One more go</Badge>
              <span className="text-sm text-muted-foreground">A position you haven't seen; the end-of-session redo.</span>
            </Row>
          </Demo>
        </div>
      </div>
      <div className="grid gap-4">
        {BAR_STATES.map(({ title, note, find, when }) => (
          <div key={title} className="flex flex-col gap-1.5">
            <p className="text-sm">
              <span className="font-heading text-base font-semibold">{title}</span>
              <span className="text-muted-foreground"> · {note}</span>
            </p>
            <BarFrame>
              <FindBar find={find} when={when} onNext={() => {}} onLine={find.outcome ? () => {} : undefined}>
                {find.outcome && <p>The rook mates on the back rank: the pawns box the king in.</p>}
              </FindBar>
            </BarFrame>
          </div>
        ))}
        <div className="flex flex-col gap-1.5">
          <p className="text-sm">
            <span className="font-heading text-base font-semibold">Great move</span>
            <span className="text-muted-foreground"> · gold: a review step praising your move, with its badge as the mark.</span>
          </p>
          <BarFrame>
            <LessonBar tone="gold">
              <LessonVerdict
                tone="gold"
                icon={<MoveBadge kind="great" pop className="size-12 text-xl [&_svg]:size-7" />}
                title={
                  <>
                    Great move: <MoveText ply={41} san="Rxh7+" number />
                  </>
                }
                actions={<Button size="lg">Continue</Button>}
              >
                <p>The only move that keeps the attack going.</p>
              </LessonVerdict>
            </LessonBar>
          </BarFrame>
        </div>
      </div>
    </Block>
  )
}

// The same marks as pages/review-done.tsx and pages/practice.tsx (Done for today).
const MARKS = [
  ['found', 'bg-brand'],
  ['a good move', 'bg-[color-mix(in_srgb,var(--brand)_50%,var(--card))]'],
  ['found with help', 'bg-sky'],
  ['missed', 'bg-danger'],
  ['a great move', 'bg-gold'],
] as const
const MARK_ROW = [0, 0, 1, 3, 0, 4, 2, 0, 3, 0]

/** The row of marks on Review complete and Done for today. */
function MarksBlock() {
  return (
    <Block
      title="Marks"
      note="One mark per position or key moment, on Review complete and Done for today. Each has an aria-label saying how it went, and the line under the row names the misses."
    >
      <div className="panel flex flex-col gap-3 p-5">
        <p className="eyebrow">Today, one by one</p>
        <div className="flex gap-1.5">
          {MARK_ROW.map((m, i) => (
            <span key={i} role="img" aria-label={`Position ${i + 1}: ${MARKS[m][0]}`} className={cn('h-3.5 flex-1 rounded-full', MARKS[m][1])} />
          ))}
        </div>
        <p className="text-sm text-muted-foreground">To go over again: 12. Nf5 vs woolcap, 24…Kf8 vs woolcap.</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t-2 pt-3">
          {MARKS.map(([label, cls]) => (
            <span key={label} className="flex items-center gap-2 text-sm">
              <span className={cn('h-3 w-6 rounded-full', cls)} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </Block>
  )
}

/** The bot's bubble and Blunder check. */
function PlayBlock() {
  return (
    <Block title="Play" note="BotSays and BlunderWarning (pages/play.tsx), in the panel beside the board.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="panel flex flex-col overflow-hidden">
          <BotSays elo={1200} text="Good luck! I play at about 1200." />
          <BotSays elo={1200} text={null} />
          <BotSays elo={1200} text="Couldn't reach the engine." error />
        </div>
        <div className="panel overflow-hidden">
          <BotSays elo={1200} text="Hmm, are you sure about that?" />
          <BlunderWarning
            check={{ blunder: true, before: 62, after: 18, reply_san: 'Nxe4', wins: 'knight' }}
            you="Bc4"
            them="Black"
            onBack={() => {}}
            onPlay={() => {}}
          />
        </div>
      </div>
    </Block>
  )
}

/** A settings card with a segmented control and a switch. */
function SettingsBlock() {
  const [depth, setDepth] = useState<'fast' | 'standard' | 'deep'>('standard')
  const [sound, setSound] = useState(true)
  return (
    <Block
      title="Settings"
      note="Section, Row and Segmented (pages/settings.tsx), Switch (components/ui/switch.tsx). Each section is a card with its KnIcon; the control sits on the right of its row."
    >
      <SettingsSection title="Analysis" glyph="engine" description="How hard Stockfish looks at each move.">
        <SettingRow label="Depth" hint="Deeper is slower and a little more accurate.">
          <Segmented
            label="Depth"
            value={depth}
            onChange={setDepth}
            options={[
              { value: 'fast', label: 'Fast' },
              { value: 'standard', label: 'Standard' },
              { value: 'deep', label: 'Deep' },
            ]}
          />
        </SettingRow>
        <SettingRow label="Sounds" hint="Moves, answers and the big moments.">
          <Switch checked={sound} onCheckedChange={setSound} aria-label="Sounds" />
        </SettingRow>
      </SettingsSection>
    </Block>
  )
}

const QUICK_PILLS = [
  ['All', 404],
  ['To review', 6],
  ['Wins', 198],
  ['Losses', 181],
  ['Had a blunder', 143],
  ['Thrown wins', 37],
] as const
const GAME: Game = {
  id: 1,
  played_at: '2026-10-07T07:41:00',
  speed: 'rapid',
  rated: true,
  time_control: '600',
  url: null,
  color: 'white',
  outcome: 'win',
  rating: 652,
  opponent: 'woolcap',
  opponent_rating: 661,
  eco: 'C50',
  opening: 'Italian Game',
  ended_by: 'Checkmate',
  moves: 31,
  analysed: true,
  accuracy: 84.2,
  blunders: 0,
  mistakes: 0,
  inaccuracies: 2,
  reviewed_at: '2026-10-07T08:10:00',
}
const GAMES: Game[] = [
  GAME,
  { ...GAME, id: 2, color: 'black', outcome: 'loss', opponent: 'pawnstorm88', opponent_rating: 678, eco: 'B20', opening: 'Sicilian Defense', ended_by: 'Resigned', accuracy: 61.5, blunders: 2, mistakes: 1, reviewed_at: null },
  { ...GAME, id: 3, outcome: 'draw', opponent: 'e4enjoyer', ended_by: 'Time', analysed: false, accuracy: null, reviewed_at: null },
]

/** The quick filters and a game's card. */
function GamesBlock() {
  return (
    <Block
      title="Games"
      note="The quick filters with their counts (copied from pages/games.tsx); the chosen one is ink. GameRow: one game as a card that lifts on hover."
    >
      <div className="flex flex-wrap gap-2">
        {QUICK_PILLS.map(([label, count], i) => (
          <span
            key={label}
            className={cn(
              'inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3.5 text-sm font-extrabold',
              i === 1 ? 'bg-foreground text-background' : 'bg-card text-foreground shadow-[inset_0_0_0_2px_var(--line),0_2px_0_var(--lip)]',
            )}
          >
            {label}
            <span className={cn('rounded-sm px-1.5 py-0.5 text-xs tabular-nums', i === 1 ? 'bg-background/20' : 'bg-surface-muted text-muted-foreground')}>
              {count}
            </span>
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-2.5">
        {GAMES.map((g) => (
          <GameRow key={g.id} game={g} />
        ))}
      </div>
    </Block>
  )
}

/** Progress's unit cards: the lead one in brand, the rest locked or done (copied from pages/overview.tsx). */
function UnitCardsBlock() {
  const cards = [
    { n: 1, title: 'Stop hanging pieces', value: '2.3', suffix: 'blunders a game', line: 'target under 1.5', state: 'lead' },
    { n: 2, title: 'Finish what you start', value: '71%', suffix: 'conversion', line: '9 wins thrown', state: 'locked' },
    { n: 3, title: 'Punish their mistakes', value: '58%', suffix: 'punished', line: 'of 64 blunders', state: 'locked' },
    { n: 4, title: 'Never give up', value: '48%', suffix: 'comebacks', line: 'from 41 losing positions', state: 'done' },
  ] as const
  return (
    <Block title="Units" note="Progress's unit cards: one per KPI, Unit 1 (your weakest) in brand with its unit check, the rest locked or done. Each links to its games.">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const lead = c.state === 'lead'
          return (
            <a
              key={c.n}
              href="#units"
              className={cn('panel panel-link flex h-full flex-col gap-2 p-5', lead && 'border-brand-lip bg-brand text-on-brand shadow-[0_4px_0_var(--brand-lip)]')}
            >
              <div className="flex items-center justify-between">
                <span className={cn('text-xs font-extrabold tracking-[.06em] uppercase', !lead && 'text-muted-foreground')}>
                  Unit {c.n}
                  {lead ? ' · Now' : c.state === 'done' ? ' · Done' : ''}
                </span>
                {c.state === 'locked' && <KnIcon glyph="lock" className="size-6" />}
                {c.state === 'done' && <KnIcon glyph="check" className="size-6" />}
              </div>
              <h3 className="font-heading text-lg font-semibold">{c.title}</h3>
              <p className="font-heading text-3xl font-bold">
                {c.value}
                <span className={cn('font-sans text-base font-semibold', !lead && 'text-muted-foreground')}> {c.suffix}</span>
              </p>
              <p className={cn('text-sm font-semibold', !lead && 'text-muted-foreground')}>{c.line}</p>
              {lead && (
                <>
                  <div className="mt-1 h-3 overflow-hidden rounded-full bg-brand-lip">
                    <div className="h-full w-3/10 rounded-full bg-on-brand" />
                  </div>
                  <p className="text-[13px] font-extrabold">Unit check: 3 of 10 games under 1.5</p>
                </>
              )}
              <span className={cn('mt-auto flex items-center gap-1 pt-1 text-xs', lead ? 'font-bold' : 'text-muted-foreground')}>
                Games <ArrowRightIcon className="size-3" />
              </span>
            </a>
          )
        })}
      </div>
    </Block>
  )
}

// A made-up game's win chance for White, ply by ply.
const WHITE_WIN = Array.from({ length: 61 }, (_, p) =>
  Math.max(3, Math.min(97, 52 + 4 * Math.sin(p / 3) - (p > 15 ? 24 : 0) + (p > 25 ? 36 : 0) - (p > 33 ? 14 : 0) + (p > 45 ? 30 : 0))),
)
const MOMENTS: KeyMoment[] = [
  { ply: 15, kind: 'blunder', short: '8. Nf5', headline: '' },
  { ply: 25, kind: 'great', short: '13. Rxe6', headline: '' },
  { ply: 33, kind: 'miss', short: '17. Qd2', headline: '' },
  { ply: 45, kind: 'best', short: '23. Bxf7+', headline: '' },
]

/** All moves' win-chance graph, with the lesson's key moments as badges. */
function WinGraphBlock() {
  const [ply, setPly] = useState(25)
  return (
    <Block
      title="Win graph"
      note="WinGraph (pages/review-moves.tsx): your winning chance over the game, the key moments as badges on the line, a sky line where you are. Click to jump."
    >
      <div className="max-w-xl">
        <WinGraph replay={{ whiteWin: WHITE_WIN } as unknown as Replay} me="white" ply={ply} moments={MOMENTS} onSelect={setPly} />
      </div>
    </Block>
  )
}
