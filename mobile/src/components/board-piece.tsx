import { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  ReduceMotion,
} from "react-native-reanimated";
import { type BoardPiece, coordinates, MOVE_MS } from "../lib/board-motion";
import { Piece } from "./piece";
export function MovingPiece({
  piece,
  cell,
  flipped,
  selected,
  fallen,
  captured = false,
  animate,
}: {
  piece: BoardPiece;
  cell: number;
  flipped: boolean;
  selected: boolean;
  fallen: boolean;
  captured?: boolean;
  animate: boolean;
}) {
  const point = coordinates(piece.square, flipped);
  const x = useSharedValue(point.x * cell),
    y = useSharedValue(point.y * cell);
  const scale = useSharedValue(1),
    opacity = useSharedValue(1),
    angle = useSharedValue(fallen && !animate ? -90 : 0);
  const previous = useRef({ cell, flipped });
  useEffect(() => {
    const snap =
      !animate ||
      previous.current.cell !== cell ||
      previous.current.flipped !== flipped;
    const config = {
      duration: MOVE_MS,
      easing: Easing.bezier(0.65, 0, 0.35, 1),
      reduceMotion: ReduceMotion.System,
    };
    x.value = snap ? point.x * cell : withTiming(point.x * cell, config);
    y.value = snap ? point.y * cell : withTiming(point.y * cell, config);
    previous.current = { cell, flipped };
  }, [point.x, point.y, cell, flipped, animate, x, y]);
  useEffect(() => {
    scale.value = withTiming(selected ? 1.08 : 1, { duration: 120 });
  }, [selected, scale]);
  useEffect(() => {
    opacity.value = captured ? withTiming(0, { duration: MOVE_MS }) : 1;
  }, [captured, opacity]);
  useEffect(() => {
    angle.value = fallen
      ? animate
        ? withDelay(
            MOVE_MS + 380,
            withTiming(-90, {
              duration: 420,
              easing: Easing.out(Easing.back(1.3)),
            }),
          )
        : -90
      : 0;
  }, [fallen, animate, angle]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: scale.value },
      { rotate: `${angle.value}deg` },
    ],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.piece,
        { width: cell, height: cell, zIndex: selected ? 3 : 1 },
        style,
      ]}
    >
      <Piece kind={piece.kind} side={piece.side} />
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  piece: {
    position: "absolute",
    top: 0,
    left: 0,
    justifyContent: "center",
    alignItems: "center",
  },
});
