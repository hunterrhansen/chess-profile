import { ClerkProvider, SignIn, useAuth, useClerk, useReverification, useUser } from '@clerk/react'
import { SignOutIcon } from '@phosphor-icons/react'
import { type ReactNode, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Logo, LogoLoader } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { send, setTokenSource } from '@/lib/api'
import { deleteAccount } from '@/lib/delete-account'

/**
 * Sign-in, with Clerk. The server says whether to use it: `/api/config` gives its
 * CLERK_PUBLISHABLE_KEY, read once before the app renders (main.tsx), so one build serves
 * staging and production. With a key, the app shows the sign-in screen until you're signed in,
 * then sends your session token with every API call. Without one (Knightly on your own Mac,
 * before Clerk), there's no sign-in: the server serves its one local user.
 */
let KEY: string | null = null

/** The publishable key from the server's config, or null for no sign-in. Set before rendering. */
export function setClerkKey(key: string | null | undefined) {
  KEY = key || null
}

export const signInEnabled = () => !!KEY

let CONTACT: string | null = null

/** Who to write to about your data (KNIGHTLY_CONTACT), for the privacy page. */
export function setContact(contact: string | null | undefined) {
  CONTACT = contact || null
}

export const contact = () => CONTACT

/** Clerk's components in Knightly's tokens, so they follow the light and dark themes. */
const appearance = {
  variables: {
    colorPrimary: 'var(--brand)',
    colorPrimaryForeground: 'var(--on-brand)',
    colorForeground: 'var(--ink)',
    colorMutedForeground: 'var(--ink-muted)',
    colorMuted: 'var(--surface-muted)',
    colorBackground: 'var(--surface)',
    colorInput: 'var(--surface)',
    colorInputForeground: 'var(--ink)',
    colorBorder: 'var(--line)',
    colorRing: 'var(--focus)',
    colorDanger: 'var(--danger-text)',
    colorNeutral: 'var(--ink)',
    colorShadow: 'transparent',
    borderRadius: '12px',
    fontFamily: 'var(--font-sans)',
    fontFamilyButtons: 'var(--font-sans)',
  },
  // Clerk's own styles win on specificity, so these carry `!` (Tailwind's important).
  elements: {
    // A panel on its ledge, like every card in the app; no soft shadows.
    cardBox: 'rounded-xl! border-2! border-line! shadow-[0_2px_0_var(--lip)]!',
    card: 'bg-surface! shadow-none!',
    footer: 'bg-surface-muted!',
    headerTitle: 'font-heading text-xl',
    // The main button: brand green on its ledge, sinking when pressed (as Button's default).
    formButtonPrimary:
      'bg-brand! text-on-brand! uppercase tracking-wide font-extrabold rounded-lg! mb-1 shadow-[0_4px_0_var(--brand-lip)]! hover:brightness-105 active:translate-y-1 active:shadow-none!',
    socialButtonsBlockButton:
      'border-2! border-line! bg-surface! rounded-lg! mb-1 shadow-[0_3px_0_var(--line)]! hover:bg-surface-muted! active:translate-y-[3px] active:shadow-none!',
    formFieldInput: 'border-2! border-line! rounded-md! shadow-none! focus:border-focus!',
    footerActionLink: 'text-brand-text! font-extrabold',
  },
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!KEY) return children
  return (
    <ClerkProvider publishableKey={KEY} appearance={appearance}>
      <AuthGate>{children}</AuthGate>
    </ClerkProvider>
  )
}

function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  // Set while rendering, not in an effect: the pages' first requests run before this
  // component's effects would, and need the token too.
  setTokenSource(isSignedIn ? () => getToken() : null)
  if (!isLoaded) return <LogoLoader label="Opening Knightly…" className="min-h-dvh justify-center" />
  if (!isSignedIn) return <SignInScreen />
  return children
}

/** Signed out: the mark, what Knightly is for, and Clerk's sign-in (or sign-up) form. */
export function SignInScreen({ form = <SignIn withSignUp routing="hash" /> }: { form?: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-4 py-10">
      <SignInHeader />
      {form}
      <Link to="/privacy" className="text-sm font-bold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        Privacy
      </Link>
    </main>
  )
}

export function SignInHeader() {
  return (
    <div className="flex max-w-sm flex-col items-center gap-3 text-center">
      <Logo markClassName="size-12" className="[&>span:last-child]:text-3xl" />
      <h1 className="text-2xl">Turn your games into practice</h1>
      <p className="text-muted-foreground">
        Knightly finds the moves you missed in your own games and brings them back until you find them.
      </p>
    </div>
  )
}

/** Who you're signed in as, and Sign out (Settings). Nothing without sign-in. */
export function SignedInAs() {
  return signInEnabled() ? <SignedInAsRow /> : null
}

function SignedInAsRow() {
  const { user } = useUser()
  const { signOut } = useClerk()
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <span className="min-w-0">
        <span className="block font-extrabold">Signed in</span>
        <span className="block truncate text-sm text-muted-foreground">
          {user?.primaryEmailAddress?.emailAddress ?? user?.username ?? 'Your account'}
        </span>
      </span>
      <Button variant="outline" size="sm" onClick={() => signOut()}>
        <SignOutIcon />
        Sign out
      </Button>
    </div>
  )
}

/**
 * Delete account (Settings › Your data): asks first (type "delete"), then deletes your data
 * on the server, then your Clerk account, which signs you out. Nothing without sign-in: on
 * your own Mac there's no account to delete.
 */
export function DeleteAccount({ games }: { games: number }) {
  return signInEnabled() ? <DeleteAccountRow games={games} /> : null
}

function DeleteAccountRow({ games }: { games: number }) {
  const { user } = useUser()
  const deleteSignIn = useReverification(async () => {
    if (!user) throw new Error('Sign in again to finish deleting your account.')
    await user.delete()
  })
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await deleteAccount(
        () => send('DELETE', '/api/account'),
        async () => {
          // A native modal makes the rest of the page inert, including Clerk's
          // verification modal. Close ours before Clerk asks for verification.
          setOpen(false)
          await deleteSignIn()
        },
      )
    } catch (e) {
      setError((e as Error).message)
      setOpen(true)
      setBusy(false)
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3.5">
      <div className="min-w-0 flex-1 basis-60">
        <div className="font-extrabold">Delete your account</div>
        <div className="mt-0.5 text-[13px] text-muted-foreground">Your games, reviews, practice and sign-in, all gone at once.</div>
      </div>
      <Button variant="danger" size="sm" disabled={busy} onClick={() => { setError(null); setOpen(true) }}>
        Delete account
      </Button>
      <ConfirmDialog
        open={open}
        title="Delete your account?"
        confirmLabel="Delete everything"
        cancelLabel="Keep my account"
        word="delete"
        busy={busy}
        error={error}
        onConfirm={remove}
        onClose={() => setOpen(false)}
      >
        <p>This deletes, right away and for good:</p>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-foreground">
          <li>
            {games.toLocaleString()} game{games === 1 ? '' : 's'} and their analysis
          </li>
          <li>Your reviews, practice cards and puzzle history</li>
          <li>Your sign-in. Your Chess.com and Lichess accounts aren't touched.</li>
        </ul>
        <p className="text-sm">Want a copy? Download your data first.</p>
      </ConfirmDialog>
    </div>
  )
}
