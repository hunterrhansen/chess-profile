import { useState } from "react";
import { View } from "react-native";
import { Host } from "@expo/ui";
import { PromotionPicker } from "./promotion-picker";
import { useTheme } from "@/lib/theme";
import type { Promotion } from "@/lib/practice-flow";
import { LessonAction } from "./lesson-screen";
const names: Record<Promotion, string> = {
  q: "Queen",
  r: "Rook",
  b: "Bishop",
  n: "Knight",
};
/** Choosing a piece does not submit a move until the player confirms it. */
export function PromotionChoice({
  choices,
  onChoose,
  onCancel,
}: {
  choices: Promotion[];
  onChoose: (kind: Promotion) => void;
  onCancel: () => void;
}) {
  const [choice, setChoice] = useState<Promotion>(choices[0]);
  const { isDark } = useTheme();
  return (
    <View style={{ flex: 1, gap: 8 }}>
      <Host
        colorScheme={isDark ? "dark" : "light"}
        matchContents={{ vertical: true }}
        style={{ width: "100%", minHeight: 44 }}
      >
        <PromotionPicker
          choice={choice}
          onChange={setChoice}
          options={choices.map((value) => ({ value, label: names[value] }))}
        />
      </Host>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <LessonAction quiet label="Cancel" onPress={onCancel} />
        <LessonAction
          label={`Promote to ${names[choice]}`}
          onPress={() => onChoose(choice)}
        />
      </View>
    </View>
  );
}
