import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInUp, Easing, ReduceMotion, useReducedMotion } from "react-native-reanimated";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { fonts, useTheme } from "@/lib/theme";
import { Text, Progress } from "./ui";
import { KnIcon, type Glyph } from "./kn-icon";

/** A bounded lesson: the board yields space to the prompt and fixed action band. */
export function LessonScreen({
  title = "Today's positions",
  done,
  total,
  children,
  footer,
}: {
  title?: string;
  done: number;
  total: number;
  children: ReactNode;
  footer: ReactNode;
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
          <View style={{ flex: 1, gap: 6 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <Text
                style={{ fontFamily: fonts.bold, fontSize: 14, lineHeight: 20 }}
                maxFontSizeMultiplier={1.5}
              >
                {title}
              </Text>
              <Text
                style={{
                  fontFamily: fonts.bold,
                  fontSize: 14,
                  lineHeight: 20,
                  fontVariant: ["tabular-nums"],
                }}
                maxFontSizeMultiplier={1.5}
              >
                {done} of {total}
              </Text>
            </View>
            <Progress value={done} total={total} />
          </View>
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
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [promptHeight, setPromptHeight] = useState(0);
  const size = Math.max(0, Math.min(bounds.width, bounds.height - (ledge ? 4 : 0) - (prompt ? promptHeight + 12 : 0)));
  return (
    <View
      style={{ flex: 1, minHeight: 0, alignItems: "center", justifyContent: "flex-end" }}
      onLayout={({ nativeEvent }) => {
        const { width, height } = nativeEvent.layout;
        setBounds((old) =>
          old.width === width && old.height === height
            ? old
            : { width, height },
        );
      }}
    >
      {prompt && <View style={{ width: "100%", marginBottom: 12 }} onLayout={({ nativeEvent }) => setPromptHeight(nativeEvent.layout.height)}>{prompt}</View>}
      {size > 0 && <View style={{ width: size }}>{children}</View>}
    </View>
  );
}
export function LessonBar({
  feedbackKey,
  reservedHeight = 0,
  tone = "idle",
  title,
  detail,
  note,
  children,
}: {
  feedbackKey?: number;
  reservedHeight?: number;
  tone?: "idle" | "retry" | "right" | "wrong";
  title?: string;
  detail: string;
  note?: string;
  children: ReactNode;
}) {
  const { colors: c } = useTheme();
  const inset = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const entrance = (reduced ? FadeIn.duration(180) : FadeInUp.duration(180).withInitialValues({ opacity: 0, transform: [{ translateY: 12 }] }))
    .easing(Easing.bezier(0.23, 1, 0.32, 1)).reduceMotion(ReduceMotion.System);
  const right = tone === "right",
    wrong = tone === "wrong" || tone === "retry";
  const color = right ? c.brandText : wrong ? c.dangerText : c.inkMuted;
  return (
    <View
      style={{
        flexShrink: 0,
        minHeight: reservedHeight,
        backgroundColor: c.page,
      }}
    >
      <View
        style={{
          flexGrow: 1,
          justifyContent: "flex-end",
          backgroundColor: right
            ? `${c.brand}33`
            : wrong
              ? `${c.danger}1a`
              : c.page,
          paddingBottom: Math.max(16, inset.bottom),
        }}
      >
        <Animated.View
          key={feedbackKey ?? "idle"}
          entering={feedbackKey === undefined ? undefined : entrance}
          accessibilityLiveRegion="polite"
          style={{
            width: "100%",
            maxWidth: 560,
            alignSelf: "center",
            paddingHorizontal: 16,
            paddingTop: 16,
            gap: 12,
          }}
        >
          {!!(title || detail || note) && <View
            style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}
          >
            {right && <KnIcon glyph="check" size={36} />}
            <View style={{ flex: 1, gap: 2 }}>
              {title && (
                <Text
                  heading
                  style={{ color, fontSize: 22, lineHeight: 28 }}
                  maxFontSizeMultiplier={1.4}
                >
                  {title}
                </Text>
              )}
              {!!detail && <Text
                style={{ color, fontSize: 14, lineHeight: 20 }}
                maxFontSizeMultiplier={1.4}
              >
                {detail}
              </Text>}
              {note && (
                <Text
                  tone="muted"
                  style={{ fontSize: 12, lineHeight: 18 }}
                  maxFontSizeMultiplier={1.3}
                >
                  {note}
                </Text>
              )}
            </View>
          </View>}
          <View style={{ flexDirection: "row", gap: 8 }}>{children}</View>
        </Animated.View>
      </View>
    </View>
  );
}
export function LessonAction({
  label,
  glyph,
  quiet = false,
  danger = false,
  disabled = false,
  onPress,
}: {
  label: string;
  glyph?: Glyph;
  quiet?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors: c } = useTheme();
  const fill = disabled
    ? c.surfaceMuted
    : quiet
      ? c.surface
      : danger
        ? c.danger
        : c.brand;
  const lip = disabled
    ? c.line
    : quiet
      ? c.line
      : danger
        ? c.dangerLip
        : c.brandLip;
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 16,
        backgroundColor: lip,
        paddingBottom: 4,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => ({
          minHeight: 48,
          paddingHorizontal: 8,
          paddingVertical: 10,
          borderWidth: 2,
          borderColor: quiet ? c.line : fill,
          backgroundColor: fill,
          borderRadius: 16,
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          gap: 6,
          transform: [{ translateY: pressed ? 4 : 0 }],
        })}
      >
        {glyph && <KnIcon glyph={glyph} size={22} />}
        <Text
          style={{
            flexShrink: 1,
            textAlign: "center",
            fontFamily: fonts.bold,
            fontSize: 13,
            lineHeight: 18,
            color: disabled
              ? c.inkMuted
              : quiet
                ? c.ink
                : danger
                  ? c.onDanger
                  : c.onBrand,
          }}
          maxFontSizeMultiplier={1.4}
        >
          {label.toUpperCase()}
        </Text>
      </Pressable>
    </View>
  );
}
