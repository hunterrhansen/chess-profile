import { useCallback, useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { subtleHaptic } from "./haptics";

/** User interaction only: position replays and board flips are silent. */
export function useBoardHaptics(
  enabled: boolean,
  feedback: { id: number; tone: "right" | "wrong" } | undefined,
  delay: number,
) {
  const seen = useRef(feedback?.id);
  const id = feedback?.id;
  useEffect(() => {
    if (id === undefined || seen.current === id) return;
    if (!enabled || Platform.OS === "web") {
      seen.current = id;
      return;
    }
    const timer = setTimeout(() => {
      seen.current = id;
      subtleHaptic();
    }, delay);
    return () => clearTimeout(timer);
  }, [enabled, id, delay]);
  return useCallback(() => {
    if (!enabled || Platform.OS === "web" || AppState.currentState !== "active")
      return;
    subtleHaptic();
  }, [enabled]);
}
