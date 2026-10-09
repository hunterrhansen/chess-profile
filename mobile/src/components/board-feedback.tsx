import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  withRepeat,
  cancelAnimation,
  ReduceMotion,
  useReducedMotion,
} from "react-native-reanimated";
import { MOVE_MS } from "../lib/board-motion";
export function BoardFeedback({
  color,
  hint = false,
  delay = MOVE_MS,
}: {
  color: string;
  hint?: boolean;
  delay?: number;
}) {
  const opacity = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    const config = { reduceMotion: ReduceMotion.System };
    opacity.set(
      hint
        ? reduced
          ? 0.3
          : withRepeat(
              withSequence(
                withTiming(0.65, { duration: 800, ...config }),
                withTiming(0.2, { duration: 800, ...config }),
              ),
              -1,
            )
        : withDelay(
            reduced ? 0 : delay,
            withSequence(
              withTiming(0.65, { duration: 100, ...config }),
              withTiming(0, { duration: 450, ...config }),
            ),
            ReduceMotion.System,
          ),
    );
    return () => cancelAnimation(opacity);
  }, [hint, reduced, delay, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      pointerEvents="none"
      accessible={false}
      style={[styles.overlay, { backgroundColor: color }, animated]}
    />
  );
}
const styles = StyleSheet.create({
  overlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
});
