import { useEffect, useState } from "react";
import { AppState, ScrollView, StyleSheet, View } from "react-native";
import Animated, { cubicBezier, useReducedMotion, type CSSAnimationKeyframes } from "react-native-reanimated";
import { useTheme } from "@/lib/theme";
import { knightLoadingFrames, KNIGHT_LOADING_MS } from "@/lib/loading-motion";
import { Piece } from "./piece";
import { Logo } from "./logo";
import { Text } from "./ui";

const SIZE = 56;
const motion: CSSAnimationKeyframes = Object.fromEntries(
  knightLoadingFrames(SIZE).map(({ percent, x, y }) => [
    `${percent}%`, { transform: [{ translateX: x }, { translateY: y }] },
  ]),
);
const easeMove = cubicBezier(0.65, 0, 0.35, 1);

/** A wait, never a progress estimate. Every landing is one legal knight move away. */
export function KnightLoader({ title = "Getting your next move ready", detail = "Picking positions from your games…", systemFont = false }: {
  title?: string; detail?: string; systemFont?: boolean;
}) {
  const { colors: c } = useTheme();
  const reduced = useReducedMotion();
  const [active, setActive] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => setActive(state === "active"));
    return () => subscription.remove();
  }, []);
  return <View style={styles.loader} accessible accessibilityState={{ busy: true }} accessibilityLabel={`${title}. ${detail}`} accessibilityLiveRegion="polite">
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden
      style={[styles.board, { backgroundColor: c.lip }]}>
      <View style={styles.squares}>
        {Array.from({ length: 9 }, (_, i) => <View key={i} style={{ width: SIZE, height: SIZE, backgroundColor: i % 2 ? c.boardDark : c.boardLight }} />)}
      </View>
      <Animated.View style={[styles.knight, { transform: [{ translateX: 0 }, { translateY: SIZE * 2 }] }, !reduced && {
        animationName: motion, animationDuration: KNIGHT_LOADING_MS,
        animationTimingFunction: easeMove, animationIterationCount: "infinite",
        animationPlayState: active ? "running" : "paused",
      }]}>
        <View style={{ width: SIZE - 8, height: SIZE - 8 }}><Piece kind="n" side="b" /></View>
      </Animated.View>
    </View>
    <Text heading style={[styles.title, systemFont && { fontFamily: undefined }]}>{title}</Text>
    <Text tone="muted" style={[styles.detail, systemFont && { fontFamily: undefined }]}>{detail}</Text>
  </View>;
}

/** Scrolls at large text sizes and on small phones; its content is centered otherwise. */
export function LoadingScreen({ title, detail, systemFont = false }: Parameters<typeof KnightLoader>[0]) {
  const { colors: c } = useTheme();
  return <ScrollView style={{ flex: 1, backgroundColor: c.page }} contentInsetAdjustmentBehavior="automatic"
    contentContainerStyle={styles.screen}>
    {systemFont ? <Text heading style={{ fontFamily: undefined, fontSize: 27, lineHeight: 34 }}>Knightly</Text> : <Logo />}
    <KnightLoader title={title} detail={detail} systemFont={systemFont} />
  </ScrollView>;
}
const styles = StyleSheet.create({
  screen: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 32 },
  loader: { alignItems: "center", paddingVertical: 24, gap: 12, width: "100%", maxWidth: 360 },
  board: { width: SIZE * 3, height: SIZE * 3 + 4, borderRadius: 10, overflow: "hidden", marginBottom: 16 },
  squares: { width: SIZE * 3, height: SIZE * 3, flexDirection: "row", flexWrap: "wrap" },
  knight: { position: "absolute", top: 0, left: 0, width: SIZE, height: SIZE, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 27, lineHeight: 33, textAlign: "center" },
  detail: { textAlign: "center" },
});
