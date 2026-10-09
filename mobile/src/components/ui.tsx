import {
  Text as NativeText,
  Pressable,
  View,
  StyleSheet,
  type TextProps,
  type PressableProps,
  type ViewProps,
} from "react-native";
import { fonts, useTheme } from "../lib/theme";
import { subtleHaptic } from "../lib/haptics";
export function Text({
  style,
  tone = "default",
  heading = false,
  ...props
}: TextProps & {
  tone?: "default" | "muted" | "brand" | "danger";
  heading?: boolean;
}) {
  const { colors: c } = useTheme();
  return (
    <NativeText
      {...props}
      style={[
        styles.text,
        {
          fontFamily: heading ? fonts.heading : fonts.body,
          color:
            tone === "muted"
              ? c.inkMuted
              : tone === "brand"
                ? c.brandText
                : tone === "danger"
                  ? c.dangerText
                  : c.ink,
        },
        style,
      ]}
    />
  );
}
export function Button({
  label,
  variant = "brand",
  disabled,
  style,
  onPressIn,
  hapticsEnabled = true,
  ...props
}: Omit<PressableProps, "children"> & {
  label: string;
  variant?: "brand" | "secondary" | "gold" | "danger";
  hapticsEnabled?: boolean;
}) {
  const { colors: c } = useTheme();
  const fill = disabled
    ? c.surfaceMuted
    : variant === "secondary"
      ? c.surface
      : c[variant];
  const lip = disabled
    ? c.line
    : variant === "secondary"
      ? c.line
      : variant === "brand"
        ? c.brandLip
        : variant === "gold"
          ? c.goldLip
          : c.dangerLip;
  const ink = disabled
    ? c.inkMuted
    : variant === "secondary"
      ? c.ink
      : variant === "brand"
        ? c.onBrand
        : variant === "gold"
          ? c.onGold
          : c.onDanger;
  return (
    <View style={[styles.buttonBase, { backgroundColor: lip }]}>
      <Pressable
        {...props}
        disabled={disabled}
        onPressIn={(event) => {
          if (!disabled && hapticsEnabled) subtleHaptic();
          onPressIn?.(event);
        }}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled }}
        style={(state) => [
          styles.button,
          {
            backgroundColor: fill,
            borderColor: variant === "secondary" ? c.line : fill,
            transform: [{ translateY: state.pressed ? 4 : 0 }],
          },
          typeof style === "function" ? style(state) : style,
        ]}
      >
        <NativeText style={[styles.buttonLabel, { color: ink }]}>
          {label}
        </NativeText>
      </Pressable>
    </View>
  );
}
export function Card({ style, ...props }: ViewProps) {
  const { colors: c } = useTheme();
  return (
    <View style={[styles.cardBase, { backgroundColor: c.lip }]}>
      <View
        {...props}
        style={[
          styles.card,
          { backgroundColor: c.surface, borderColor: c.line },
          style,
        ]}
      />
    </View>
  );
}
export function Progress({ value, total }: { value: number; total: number }) {
  const { colors: c } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Practice progress"
      accessibilityValue={{
        min: 0,
        max: total,
        now: value,
        text: `${value} of ${total} positions`,
      }}
      style={[styles.track, { backgroundColor: c.line }]}
    >
      <View
        style={[
          styles.fill,
          {
            backgroundColor: c.brand,
            width: `${Math.max(0, Math.min(1, value / Math.max(1, total))) * 100}%`,
          },
        ]}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  text: { fontSize: 16, lineHeight: 23 },
  buttonBase: { borderRadius: 14, paddingBottom: 4 },
  button: {
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonLabel: {
    fontFamily: fonts.bold,
    fontSize: 15,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  cardBase: { borderRadius: 24, paddingBottom: 3 },
  card: { borderRadius: 24, borderWidth: 2, padding: 20, gap: 8 },
  track: { height: 12, borderRadius: 6, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 6 },
});
