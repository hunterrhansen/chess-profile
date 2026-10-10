import { type ReactNode } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts, useTheme } from "@/lib/theme";
import { KnIcon, type Glyph } from "./kn-icon";
import { Text } from "./ui";

/** Shared geometry for every state of a lesson, including its completion. */
export function BottomActions({ primary, secondary, feedback, tone = "idle" }: {
  primary: ReactNode;
  secondary?: ReactNode;
  feedback?: ReactNode;
  tone?: "idle" | "retry" | "right" | "wrong";
}) {
  const { colors: c } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const extra = Math.ceil(36 * (Math.max(1, fontScale) - 1));
  const bottomPadding = Math.max(16, bottom);
  return <View style={{ flexShrink: 0, height: 160 + extra * 2 + bottomPadding - 16,
    backgroundColor: tone === "right" ? `${c.brand}33` : tone === "wrong" || tone === "retry" ? `${c.danger}1a` : c.page }}>
    <View style={{ flex: 1, width: "100%", maxWidth: 560, alignSelf: "center", paddingHorizontal: 16, paddingTop: 16,
      paddingBottom: bottomPadding, gap: 12 }}>
      <ScrollView bounces={false} style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}>
        {feedback}
      </ScrollView>
      <View style={{ height: 64 + extra, flexShrink: 0, flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>{secondary}</View>
        <View style={{ flex: 1, minWidth: 0 }}>{primary}</View>
      </View>
    </View>
  </View>;
}

/** Full-slot button: labels and colors may change, its bounds do not. */
export function BottomAction({ label, glyph, quiet = false, danger = false, disabled = false, onPress }: {
  label: string;
  glyph?: Glyph;
  quiet?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors: c } = useTheme();
  const fill = disabled ? c.surfaceMuted : quiet ? c.surface : danger ? c.danger : c.brand;
  const lip = disabled ? c.line : quiet ? c.line : danger ? c.dangerLip : c.brandLip;
  return <View style={{ flex: 1, borderRadius: 16, backgroundColor: lip, paddingBottom: 4 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minHeight: 48, paddingHorizontal: 8, paddingVertical: 10, borderWidth: 2,
        borderColor: quiet ? c.line : fill, backgroundColor: fill, borderRadius: 16, flexDirection: "row", justifyContent: "center",
        alignItems: "center", gap: 6, transform: [{ translateY: pressed ? 4 : 0 }] })}>
      {glyph && <KnIcon glyph={glyph} size={22} />}
      <Text style={{ flexShrink: 1, textAlign: "center", fontFamily: fonts.bold, fontSize: 13, lineHeight: 18,
        color: disabled ? c.inkMuted : quiet ? c.ink : danger ? c.onDanger : c.onBrand }}>{label.toUpperCase()}</Text>
    </Pressable>
  </View>;
}
