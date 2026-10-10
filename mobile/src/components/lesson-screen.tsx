import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import {
  SafeAreaView,
} from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInUp, Easing, ReduceMotion, useReducedMotion } from "react-native-reanimated";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { fonts, useTheme } from "@/lib/theme";
import { Text, Progress } from "./ui";
import { KnIcon } from "./kn-icon";
import { BottomActions } from "./bottom-actions";
import { BoardSizeContext } from "./board-size";

export { BottomAction as LessonAction } from "./bottom-actions";

type BoardBounds = { width: number; height: number };
const BoardBoundsContext = createContext<{ bounds?: BoardBounds; save: (bounds: BoardBounds) => void } | null>(null);

/** Keep measured geometry across keyed practice cards; invalidate on viewport changes. */
export function LessonGeometry({ children }: { children: ReactNode }) {
  const { width, height, fontScale } = useWindowDimensions();
  const key = `${width}:${height}:${fontScale}`;
  const [cache, setCache] = useState<{ key: string; bounds: BoardBounds }>();
  const value = useMemo(() => ({
    bounds: cache?.key === key ? cache.bounds : undefined,
    save: (bounds: BoardBounds) => setCache((old) =>
      old?.key === key && old.bounds.width === bounds.width && old.bounds.height === bounds.height
        ? old : { key, bounds }),
  }), [cache, key]);
  return <BoardBoundsContext.Provider value={value}>{children}</BoardBoundsContext.Provider>;
}

/** A bounded lesson: the board yields space to the prompt and fixed action band. */
export function LessonScreen({
  title = "Today's positions",
  done,
  total,
  children,
  footer,
  onFlip,
  flipDisabled = false,
}: {
  title?: string;
  done: number;
  total: number;
  children: ReactNode;
  footer: ReactNode;
  onFlip?: () => void;
  flipDisabled?: boolean;
}) {
  const { colors: c, isDark } = useTheme();
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: c.page }}
    >
      <StatusBar style={isDark ? "light" : "dark"} />
      <View
        style={{
          width: "100%",
          maxWidth: 560,
          alignSelf: "center",
          flex: 1,
          minHeight: 0,
          paddingTop: 8,
          paddingBottom: 0,
          gap: 12,
        }}
      >
        <View
          style={{
            paddingHorizontal: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Exit practice"
            onPress={() => router.dismissTo("/")}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.5 : 1,
            })}
          >
            <Text
              style={{ color: c.inkMuted, fontSize: 32, lineHeight: 38 }}
              maxFontSizeMultiplier={1.3}
            >
              ×
            </Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Progress value={done} total={total} label={`${title} progress`} />
          </View>
          <Text tone="muted" style={{ fontFamily: fonts.bold, fontSize: 14, lineHeight: 20,
            fontVariant: ["tabular-nums"], flexShrink: 0 }} maxFontSizeMultiplier={1.5} numberOfLines={1}>
            {done} of {total}
          </Text>
          {onFlip && <Pressable accessibilityRole="button" accessibilityLabel="Flip board" accessibilityState={{ disabled: flipDisabled }}
            disabled={flipDisabled} onPress={onFlip} style={({ pressed }) => ({ minWidth: 44, minHeight: 44,
              justifyContent: "center", alignItems: "center", opacity: flipDisabled ? 0.4 : pressed ? 0.6 : 1 })}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 12 }}>Flip</Text>
          </Pressable>}
        </View>
        {children}
      </View>
      {footer}
    </SafeAreaView>
  );
}
export function LessonPrompt({
  tag,
  title,
  detail,
  badge,
}: {
  badge?: ReactNode;
  tag?: string;
  title: string;
  detail?: string;
}) {
  const { colors: c } = useTheme();
  return (
    <View style={{ paddingHorizontal: 16, gap: 4 }}>
      {!!(tag || badge) && <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
        }}
      >
        {badge}
        <Text
          tone="muted"
          style={{ fontSize: 12, lineHeight: 18 }}
          maxFontSizeMultiplier={1.4}
        >
          {tag}
        </Text>
      </View>}
      <Text
        heading
        accessibilityRole="header"
        style={{ fontSize: 24, lineHeight: 30 }}
        maxFontSizeMultiplier={1.5}
      >
        {title}
      </Text>
      {!!detail && <Text
        style={{ color: c.inkMuted, fontSize: 14, lineHeight: 20 }}
        maxFontSizeMultiplier={1.4}
      >
        {detail}
      </Text>}
    </View>
  );
}
export function LessonBoard({ children, prompt, ledge = true }: { children: ReactNode; prompt?: ReactNode; ledge?: boolean }) {
  const cached = useContext(BoardBoundsContext);
  const { fontScale } = useWindowDimensions();
  const [bounds, setBounds] = useState<BoardBounds>(() => cached?.bounds ?? { width: 0, height: 0 });
  // Wording never changes the space available to the board, even on short screens.
  const promptHeight = Math.ceil(54 * Math.max(1, Math.min(fontScale, 1.5)));
  const size = Math.max(0, Math.min(bounds.width, bounds.height - (ledge ? 4 : 0) - (prompt ? promptHeight + 12 : 0)));
  return (
    <View
      style={{ flex: 1, minHeight: 0, alignItems: "center", justifyContent: "flex-end" }}
      onLayout={({ nativeEvent }) => {
        const { width, height } = nativeEvent.layout;
        cached?.save({ width, height });
        setBounds((old) => old.width === width && old.height === height ? old : { width, height });
      }}
    >
      {prompt && <ScrollView bounces={false} style={{ width: "100%", height: promptHeight, flexGrow: 0, flexShrink: 0, marginBottom: 12 }} contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}>{prompt}</ScrollView>}
      {size > 0 && <View style={{ width: size }}><BoardSizeContext.Provider value={size}>{children}</BoardSizeContext.Provider></View>}
    </View>
  );
}

export function LessonBar({ feedbackKey, tone = "idle", title, detail, note, explanation, primary, secondary }: {
  feedbackKey?: number;
  tone?: "idle" | "retry" | "right" | "wrong";
  title?: string;
  detail: string;
  note?: string;
  explanation?: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
}) {
  const { colors: c } = useTheme();
  const reduced = useReducedMotion();
  const entrance = (reduced ? FadeIn.duration(180) : FadeInUp.duration(180).withInitialValues({ opacity: 0, transform: [{ translateY: 12 }] }))
    .easing(Easing.bezier(0.23, 1, 0.32, 1)).reduceMotion(ReduceMotion.System);
  const right = tone === "right", wrong = tone === "wrong" || tone === "retry";
  const color = right ? c.brandText : wrong ? c.dangerText : c.inkMuted;
  return <BottomActions tone={tone} reservedHeight={208} primaryFullWidth={!secondary} primary={primary} secondary={secondary} feedback={
    <Animated.View key={feedbackKey ?? "idle"} entering={feedbackKey === undefined ? undefined : entrance} accessibilityLiveRegion="polite">
      {!!(title || detail || note || explanation) && <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        {right && <KnIcon glyph="check" size={36} />}
        <View style={{ flex: 1, gap: 2 }}>
          {title && <Text heading style={{ color, fontSize: 22, lineHeight: 28 }} maxFontSizeMultiplier={1.4}>{title}</Text>}
          {!!detail && <Text style={{ color, fontSize: 14, lineHeight: 20 }} maxFontSizeMultiplier={1.4}>{detail}</Text>}
          {note && <Text tone="muted" style={{ fontSize: 12, lineHeight: 18 }} maxFontSizeMultiplier={1.3}>{note}</Text>}
          {explanation}
        </View>
      </View>}
    </Animated.View>
  } />;
}
