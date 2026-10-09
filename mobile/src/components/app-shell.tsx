import { createContext, useContext, useState, type ReactNode } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router, usePathname, type Href } from "expo-router";
import {
  Tabs,
  TabList,
  TabSlot,
  TabTrigger,
  type TabTriggerSlotProps,
} from "expo-router/ui";
import { fonts, useTheme } from "@/lib/theme";
import { Text } from "@/components/ui";
import { KnIcon, type Glyph } from "@/components/kn-icon";
import { Logo } from "@/components/logo";
type Goal =
  | { status: "loading" | "error" }
  | {
      status: "ready";
      reviewed: number;
      done: number;
      total: number;
      game?: number;
    };
const Goals = createContext<{
  goal: Goal | null;
  setGoal: (goal: Goal) => void;
}>({ goal: null, setGoal: () => {} });
export const usePhoneGoal = () => useContext(Goals);
const destinations = [
  { name: "home", href: "/", glyph: "home", label: "Home" },
  { name: "games", href: "/games", glyph: "games", label: "Games" },
  { name: "play", href: "/play", glyph: "play", label: "Play" },
  { name: "progress", href: "/progress", glyph: "progress", label: "Progress" },
] as const;
function TabButton({
  isFocused,
  children,
  glyph,
  vertical = false,
  ...props
}: TabTriggerSlotProps & {
  glyph: Glyph;
  children: ReactNode;
  vertical?: boolean;
}) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      aria-selected={!!isFocused}
      accessibilityState={{ selected: !!isFocused }}
      style={({ pressed }) => ({
        flex: vertical ? undefined : 1,
        minHeight: 64,
        padding: 8,
        gap: 4,
        alignItems: "center",
        justifyContent: vertical ? "flex-start" : "center",
        flexDirection: vertical ? "row" : "column",
        borderRadius: 12,
        borderWidth: 2,
        borderColor: isFocused ? c.sky : c.surface,
        backgroundColor: isFocused
          ? `${c.sky}${vertical ? "1f" : "24"}`
          : c.surface,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <KnIcon glyph={glyph} size={28} />
      <Text
        tone={isFocused ? "default" : "muted"}
        style={{
          fontFamily: fonts.bold,
          fontSize: vertical ? 15 : 11,
          lineHeight: vertical ? 22 : 16,
          letterSpacing: vertical ? 0.6 : 0.55,
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}
function Counter({
  glyph,
  label,
  caption,
  value,
  href,
  busy = false,
}: {
  glyph: Glyph;
  label: string;
  caption: string;
  value: string;
  href?: Href;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={href ? "button" : "text"}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !href, busy }}
      disabled={!href}
      onPress={() => href && router.push(href)}
      style={({ pressed }) => ({
        minHeight: 48,
        minWidth: 44,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 4,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <KnIcon glyph={glyph} size={24} />
      <View>
        <Text
          style={{
            fontFamily: fonts.bold,
            fontSize: 16,
            lineHeight: 20,
            fontVariant: ["tabular-nums"],
          }}
        >
          {value}
        </Text>
        <Text tone="muted" style={{ fontSize: 11, lineHeight: 16 }}>
          {caption}
        </Text>
      </View>
    </Pressable>
  );
}
function GoalCounters({ goal }: { goal: Goal | null }) {
  const ready = goal?.status === "ready" ? goal : null;
  const busy = !goal || goal.status === "loading";
  const pending = busy ? "Loading today’s goals" : "Today’s goals unavailable";
  const reviewed = !!ready && ready.reviewed > 0;
  const practiceDone = !!ready && ready.total > 0 && ready.done >= ready.total;
  return (
    <>
      <Counter
        glyph={reviewed ? "check" : "review"}
        caption="Review"
        value={
          ready ? (reviewed ? "1/1" : ready.game ? "0/1" : "No game") : "—"
        }
        label={
          ready
            ? `Review: ${reviewed ? "today’s game complete" : ready.game ? "zero of one game reviewed" : "no new game; open Games"}`
            : pending
        }
        href={
          ready
            ? ready.game && !reviewed
              ? `/games/${ready.game}`
              : "/games"
            : undefined
        }
        busy={busy}
      />
      <Counter
        glyph={practiceDone ? "check" : "drill"}
        caption="Practice"
        value={
          ready
            ? ready.total > 0
              ? `${ready.done}/${ready.total}`
              : "None due"
            : "—"
        }
        label={
          ready
            ? `Practice: ${ready.total > 0 ? `${ready.done} of ${ready.total} positions${practiceDone ? "; complete" : ""}` : "no positions due"}`
            : pending
        }
        href={ready && ready.done < ready.total ? "/practice" : undefined}
        busy={busy}
      />
    </>
  );
}
export function AppShell() {
  const { colors: c, isDark } = useTheme();
  const inset = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const wide = process.env.EXPO_OS === "web" && width >= 900;
  const [goal, setGoal] = useState<Goal | null>(null);
  const pathname = usePathname();
  const home = pathname === "/";
  const empty =
    goal?.status === "ready" && ((!goal.game && !goal.reviewed) || !goal.total);
  const splitGoals = !wide && width < (empty ? 420 : 360) * fontScale;
  const showGoals = home && !wide;
  const title = home
    ? wide
      ? "Today"
      : "Knightly"
    : (destinations.find((item) => item.href === pathname)?.label ??
      "Knightly");
  return (
    <Goals.Provider value={{ goal, setGoal }}>
      <SafeAreaView
        edges={["top"]}
        style={{ flex: 1, backgroundColor: c.surface }}
      >
        <StatusBar style={isDark ? "light" : "dark"} />
        <Tabs
          options={{ backBehavior: "history" }}
          style={{ flex: 1, flexDirection: wide ? "row-reverse" : "column" }}
        >
          <View style={{ flex: 1 }}>
            <View
              style={{
                borderBottomWidth: 2,
                borderColor: c.line,
                backgroundColor: c.surface,
              }}
            >
              <View
                style={{
                  minHeight: 64,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Text
                  heading
                  style={{
                    fontSize: 23,
                    lineHeight: 30,
                    color: home && !wide ? c.brandText : c.ink,
                    flex: 1,
                  }}
                >
                  {title}
                </Text>
                {showGoals && !splitGoals && <GoalCounters goal={goal} />}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Settings"
                  onPress={() => router.push("/settings")}
                  style={({ pressed }) => ({
                    minWidth: 44,
                    minHeight: 44,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.5 : 0.7,
                  })}
                >
                  <KnIcon glyph="settings" size={24} />
                </Pressable>
              </View>
              {showGoals && splitGoals && (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 24,
                    paddingHorizontal: 16,
                    paddingBottom: 12,
                  }}
                >
                  <GoalCounters goal={goal} />
                </View>
              )}
            </View>
            <TabSlot style={{ flex: 1, backgroundColor: c.page }} />
          </View>
          <TabList
            style={{
              flexDirection: wide ? "column" : "row",
              justifyContent: "flex-start",
              gap: 4,
              padding: 8,
              paddingBottom: wide ? 8 : Math.max(8, inset.bottom),
              borderTopWidth: wide ? 0 : 2,
              borderColor: c.line,
              backgroundColor: c.surface,
              ...(wide ? { width: 220, padding: 24, borderRightWidth: 2 } : {}),
            }}
          >
            {wide && <Logo />}
            {destinations.map((d) => (
              <TabTrigger key={d.name} name={d.name} href={d.href} asChild>
                <TabButton glyph={d.glyph} vertical={wide}>
                  {d.label.toUpperCase()}
                </TabButton>
              </TabTrigger>
            ))}
          </TabList>
        </Tabs>
      </SafeAreaView>
    </Goals.Provider>
  );
}
