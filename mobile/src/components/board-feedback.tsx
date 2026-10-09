import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
} from "react-native-reanimated";
import { MOVE_MS } from "../lib/board-motion";
export function BoardFeedback({
  color,
  hint = false,
}: {
  color: string;
  hint?: boolean;
}) {
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = hint
      ? withSequence(
          withTiming(0.65, { duration: 250 }),
          withTiming(0.2, { duration: 450 }),
        )
      : withDelay(
          MOVE_MS,
          withSequence(
            withTiming(0.65, { duration: 100 }),
            withTiming(0, { duration: 450 }),
          ),
        );
  }, [hint, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.overlay, { backgroundColor: color }, animated]}
    />
  );
}
const styles = StyleSheet.create({
  overlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
});
