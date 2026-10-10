import { AppState, Platform } from "react-native";
import * as Haptics from "expo-haptics";

/** The system selection tick is shorter and gentler than a result pattern. */
export function subtleHaptic() {
  if (Platform.OS === "web" || AppState.currentState !== "active") return;
  void Haptics.selectionAsync().catch(() => {});
}

/** One short result pattern, guarded just like the selection tick. */
export function successHaptic() {
  if (Platform.OS === "web" || AppState.currentState !== "active") return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
