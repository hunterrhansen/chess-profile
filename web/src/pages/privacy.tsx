import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { contact } from '@/lib/auth'

/** When this page last changed in a way that matters. */
const UPDATED = 'October 8, 2026'

const PROCESSORS = [
  { name: 'Clerk', does: 'Sign-in: your email and sign-in sessions.' },
  { name: 'Supabase', does: 'The database that holds your games and everything above.' },
  { name: 'Oracle Cloud', does: 'The server that runs Knightly and its chess engine.' },
  { name: 'Cloudflare', does: 'Carries traffic to the server, and stores the nightly backups.' },
  { name: 'Sentry', does: 'Error reports when something breaks, so we can fix it.' },
]

/** /privacy: public, so it can be read before signing up (linked from the sign-in screen and
 * Settings › Your data). The contact is the server's KNIGHTLY_CONTACT. */
export function PrivacyPage() {
  const email = contact()
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex max-w-[720px] items-center gap-3 px-6 py-5">
        <Link to="/" aria-label="Knightly home">
          <Logo markClassName="size-10" />
        </Link>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" asChild>
          <Link to="/settings">Back</Link>
        </Button>
      </header>
      <main className="mx-auto flex max-w-[720px] flex-col gap-7 px-6 pt-4 pb-20 text-[17px] leading-relaxed">
        <div>
          <h1 className="text-4xl font-bold sm:text-5xl">Privacy</h1>
          <p className="mt-2.5 text-muted-foreground">
            Last updated {UPDATED}. In short: Knightly keeps your chess games and what you do with them, so it can teach you from
            your own mistakes. It doesn't sell anything, show ads or track you around the web.
          </p>
        </div>

        <Part title="What Knightly keeps">
          <ul className="flex list-disc flex-col gap-2 pl-5.5">
            <li>
              <b>Your sign-in:</b> your email address (or the Google or Apple account you sign in with), kept by Clerk, which runs
              sign-in for us.
            </li>
            <li>
              <b>Your chess usernames</b> on Chess.com and Lichess, and the public games those sites publish for them: the moves,
              clocks, ratings and your opponents' usernames.
            </li>
            <li>
              <b>What Knightly works out:</b> the engine's verdict on each of your moves, and the tactics behind your mistakes.
            </li>
            <li>
              <b>What you do here:</b> games you review, positions you practise and how you answer, puzzles, games against the bot,
              and your settings.
            </li>
          </ul>
        </Part>

        <Part title="Who handles it for us">
          <div className="panel divide-y-2 overflow-hidden text-base">
            {PROCESSORS.map((p) => (
              <div key={p.name} className="flex flex-wrap gap-x-4 gap-y-1 px-5 py-3.5">
                <span className="basis-44 font-extrabold">{p.name}</span>
                <span className="min-w-0 flex-1 basis-64 text-muted-foreground">{p.does}</span>
              </div>
            ))}
          </div>
          <p>Knightly reads your games from Chess.com and Lichess through their public APIs. It never posts, plays or changes anything there.</p>
        </Part>

        <Part title="Cookies">
          <p>
            Only the ones that keep you signed in (Clerk's). No analytics, no advertising, nothing from other sites. Your theme and
            board choices stay in your browser.
          </p>
        </Part>

        <Part title="How long, and your choices">
          <ul className="flex list-disc flex-col gap-2 pl-5.5">
            <li>Everything is kept until you delete your account.</li>
            <li>
              <b>Download it</b> any time: Settings › Your data › Download gives you your games as PGN and the rest as spreadsheets.
            </li>
            <li>
              <b>Delete it</b> any time: Settings › Your data › Delete account removes it all at once. Nightly backups roll off
              within 30 days.
            </li>
            <li>
              Removing a Chess.com or Lichess account in Settings stops syncing it; its games stay until you delete them with your
              account.
            </li>
          </ul>
        </Part>

        <Part title="Questions">
          <p>
            {email ? (
              <>
                Email{' '}
                <a href={`mailto:${email}`} className="font-bold underline underline-offset-4">
                  {email}
                </a>
                .{' '}
              </>
            ) : null}
            If this page changes in a way that matters, Knightly will say so when you next sign in.
          </p>
        </Part>
      </main>
    </div>
  )
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-2xl font-bold">{title}</h2>
      {children}
    </section>
  )
}
