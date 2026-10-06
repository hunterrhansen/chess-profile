import { ArrowRight, Play } from 'lucide-react'
import type { ReactNode } from 'react'
import { EvalBar } from '@/components/eval-bar'
import { ResultBadge } from '@/components/game-bits'
import { MoveBadge } from '@/components/move-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { StatDelta, StatLabel, StatValue } from '@/components/ui/stat'
import type { Classification } from '@/lib/api'
import { CLASSIFICATION } from '@/lib/classification'

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
            <Play /> Review game
          </Button>
          <Button size="sm">Save</Button>
          <Button size="xs" variant="outline">
            Edit
          </Button>
          <Button size="icon" variant="outline" aria-label="Next">
            <ArrowRight />
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
                  Games analysed <ArrowRight className="size-3.5" />
                </StatLabel>
                <StatValue className="mt-1">404</StatValue>
              </CardHeader>
            </Card>
          </a>
        </div>
      </Block>

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

const KINDS: Classification[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder', 'miss']

const COLOR_GROUPS: [string, string[]][] = [
  ['Surfaces and text', ['page', 'surface', 'surface-muted', 'line', 'lip', 'ink', 'ink-muted', 'focus']],
  ['Brand and accents', ['brand', 'brand-lip', 'on-brand', 'brand-text', 'gold', 'gold-lip', 'on-gold', 'gold-text']],
  ['More accents', ['sky', 'sky-lip', 'on-sky', 'danger', 'danger-lip', 'on-danger', 'danger-text']],
  ['Chess', ['board-light', 'board-dark', 'board-highlight-light', 'board-highlight-dark', 'eval-white', 'eval-black', 'win', 'loss', 'draw']],
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
