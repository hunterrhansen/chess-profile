import { ClerkProvider, SignIn, useAuth, useClerk, useUser } from '@clerk/react'
import { SignOutIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Logo, LogoLoader } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { setTokenSource } from '@/lib/api'

/**
 * Sign-in, with Clerk. With VITE_CLERK_PUBLISHABLE_KEY set (web/.env.local), the app shows the
 * sign-in screen until you're signed in, then sends your session token with every API call.
 * Without it (Knightly on your own Mac, before Clerk), there's no sign-in: the server serves
 * its one local user. The key is public: it ships in the app.
 */
const KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined
export const signInEnabled = !!KEY

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
  return signInEnabled ? <SignedInAsRow /> : null
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
