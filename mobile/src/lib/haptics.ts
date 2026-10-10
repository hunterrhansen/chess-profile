import { AppState, Platform } from "react-native";
import * as Haptics from "expo-haptics";

/** The system selection tick is shorter and gentler than a result pattern. */
export function subtleHaptic() {
  if (Platform.OS === "web" || AppState.currentState !== "active") return;
  void Haptics.selectionAsync().catch(() => {});
}

/** A single crisp impact; notification success is a longer system pattern. */
export function successHaptic() {
  if (Platform.OS === "web" || AppState.currentState !== "active") return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
}
