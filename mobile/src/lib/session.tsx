import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ClerkProvider, useAuth, useClerk, useUser } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { useHostedAuth } from "@clerk/expo/hosted-auth";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView, StyleSheet } from "react-native";
import { request } from "./api";
import { createApi, serverUrl, type Api } from "./api";
import { useTheme } from "./theme";
import { Button, Text } from "../components/ui";
import { Logo } from "../components/logo";
const configured = process.env.EXPO_PUBLIC_API_URL;
type Session = {
  connected: boolean;
  api: Api;
  account: string;
  practiceScope: string;
  signOut: () => Promise<void>;
};
const SessionContext = createContext<Session | null>(null);
const demo: Session = {
  connected: false,
  account: "Sample practice",
  practiceScope: "sample",
  signOut: async () => {},
  api: async () => {
    throw new Error("Real practice needs a configured Knightly server.");
  },
};
export function useSession() {
  return useContext(SessionContext) ?? demo;
}
export function SessionProvider({ children }: { children: ReactNode }) {
  const [key, setKey] = useState<string>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!configured) return;
    const abort = new AbortController();
    async function load() {
      const url = serverUrl(configured!);
      const response = await request(`${url}/api/config`, {
        signal: abort.signal,
      });
      if (!response.ok) throw new Error("Couldn't load your Knightly server.");
      const config = await response.json();
      if (!config.clerk_publishable_key)
        throw new Error(
          "This server does not have account sign-in configured. Use a Clerk-enabled hosted Knightly server.",
        );
      if (!abort.signal.aborted) setKey(config.clerk_publishable_key);
    }
    load().catch((err) => {
      if (!abort.signal.aborted)
        setError(
          err instanceof Error ? err.message : "Couldn't connect to Knightly.",
        );
    });
    return () => abort.abort();
  }, [attempt]);
  if (!configured)
    return (
      <SessionContext.Provider value={demo}>{children}</SessionContext.Provider>
    );
  if (!key)
    return (
      <SessionPanel>
        <Logo />
        <Text heading>
          {error ? "Couldn't connect" : "Connecting to Knightly…"}
        </Text>
        {error && (
          <>
            <Text tone="danger">{error}</Text>
            <Button
              label="Try again"
              onPress={() => {
                setError(undefined);
                setAttempt((n) => n + 1);
              }}
            />
          </>
        )}
      </SessionPanel>
    );
  return (
    <ClerkProvider publishableKey={key} tokenCache={tokenCache}>
      <AccountSession>{children}</AccountSession>
    </ClerkProvider>
  );
}
function AccountSession({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();
  const api = useMemo(
    () => createApi(serverUrl(configured!), () => getToken()),
    [getToken],
  );
  const session = useMemo(
    () => ({
      connected: true,
      practiceScope: `${serverUrl(configured!)}/${user?.id ?? "signed-out"}`,
      api,
      account:
        user?.primaryEmailAddress?.emailAddress ??
        user?.username ??
        "Your Knightly account",
      signOut: async () => {
        await signOut();
      },
    }),
    [api, user, signOut],
  );
  if (!isLoaded)
    return (
      <SessionPanel>
        <Text>Opening your account…</Text>
      </SessionPanel>
    );
  if (!isSignedIn) return <SignIn />;
  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}
function SignIn() {
  const { startHostedAuth } = useHostedAuth();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
  async function signIn() {
    setBusy(true);
    setError(undefined);
    try {
      await startHostedAuth();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Sign-in couldn't finish. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <SessionPanel>
      <Logo />
      <Text heading style={{ fontSize: 29 }}>
        Turn your games into practice
      </Text>
      <Text tone="muted">
        Sign in with the same Knightly account you use on the web. Your games
        and review progress stay together.
      </Text>
      {error && (
        <Text tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      )}
      <Button
        label={busy ? "Signing in…" : "Sign in to Knightly"}
        disabled={busy}
        onPress={signIn}
      />
    </SessionPanel>
  );
}
function SessionPanel({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }}>
      <ScrollView contentContainerStyle={styles.panel}>{children}</ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  panel: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 24 },
});
