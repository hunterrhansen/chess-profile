import { useCallback, useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { subtleHaptic, successHaptic } from "./haptics";

/** User interaction only: position replays and board flips are silent. */
export function useBoardHaptics(
  enabled: boolean,
  feedback: { id: number; tone: "right" | "wrong" } | undefined,
) {
  const seen = useRef(feedback?.id);
  const id = feedback?.id;
  const tone = feedback?.tone;
  useEffect(() => {
    if (id === undefined || seen.current === id) return;
    if (!enabled || Platform.OS === "web") {
      seen.current = id;
      return;
    }
    seen.current = id;
    if (tone === "right") successHaptic();
    else subtleHaptic();
  }, [enabled, id, tone]);
  return useCallback(() => {
    if (!enabled || Platform.OS === "web" || AppState.currentState !== "active")
      return;
    subtleHaptic();
  }, [enabled]);
}
