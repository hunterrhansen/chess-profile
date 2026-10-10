import { View } from "react-native";
import { useTheme } from "@/lib/theme";
import { Text } from "./ui";
const kinds = {
  brilliant: ["Brilliant", "moveBrilliant", "!!"],
  great: ["Great", "moveGreat", "!"],
  best: ["Best", "moveBest", "★"],
  excellent: ["Excellent", "moveExcellent", "✓"],
  good: ["Good", "moveGood", "✓"],
  inaccuracy: ["Inaccuracy", "moveInaccuracy", "?!"],
  mistake: ["Mistake", "moveMistake", "?"],
  blunder: ["Blunder", "moveBlunder", "??"],
  miss: ["Miss", "moveMiss", "×"],
} as const;
export function MoveClassification({ kind }: { kind: string }) {
  const { colors } = useTheme();
  const entry = kinds[kind as keyof typeof kinds];
  if (!entry) return null;
  const [label, token, symbol] = entry;
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
    >
      <View
        style={{
          minWidth: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: colors[token],
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{ color: colors.onMove, fontSize: 12, lineHeight: 18 }}
          maxFontSizeMultiplier={1}
        >
          {symbol}
        </Text>
      </View>
      <Text
        tone="muted"
        style={{ fontSize: 12, lineHeight: 18 }}
        maxFontSizeMultiplier={1.4}
      >
        {label}
      </Text>
    </View>
  );
}
