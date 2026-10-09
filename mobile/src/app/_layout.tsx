import { Stack } from "expo-router/stack";
import { useFonts } from "expo-font";
import { Nunito_600SemiBold } from "@expo-google-fonts/nunito/600SemiBold";
import { Nunito_800ExtraBold } from "@expo-google-fonts/nunito/800ExtraBold";
import { Fredoka_600SemiBold } from "@expo-google-fonts/fredoka/600SemiBold";
import { PortalHost } from "@rn-primitives/portal";
import { ThemeProvider, useTheme } from "@/lib/theme";
import { SessionProvider } from "@/lib/session";
import { Text } from "@/components/ui";
export const unstable_settings = { initialRouteName: "(tabs)" };
function Navigation() {
  const { colors } = useTheme();
  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.page },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="practice" />
        <Stack.Screen name="puzzles" />
        <Stack.Screen name="games/[id]" />
      </Stack>
      <PortalHost />
    </>
  );
}
export default function RootLayout() {
  const [loaded, error] = useFonts({
    Nunito_600SemiBold,
    Nunito_800ExtraBold,
    Fredoka_600SemiBold,
  });
  return (
    <ThemeProvider>
      {loaded || error ? (
        <SessionProvider>
          <Navigation />
        </SessionProvider>
      ) : (
        <Text style={{ padding: 24 }}>Opening Knightly…</Text>
      )}
    </ThemeProvider>
  );
}
