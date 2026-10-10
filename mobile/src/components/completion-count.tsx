import { useEffect, useState } from "react";
import { TextInput, View, type TextInputProps, type StyleProp, type TextStyle } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { fonts, useTheme } from "@/lib/theme";
import { scheduleOnRN } from "react-native-worklets";

const AnimatedInput = Animated.createAnimatedComponent(TextInput);

/** Native text updates on the UI thread; accessibility always gets the final count. */
export function CompletionCount({ value, delay, style }: {
  value: number;
  delay: number;
  style?: StyleProp<TextStyle>;
}) {
  const reduced = useReducedMotion();
  const { colors: c } = useTheme();
  const count = useSharedValue(reduced ? value : 0);
  const [fallback, setFallback] = useState(reduced ? value : 0);
  useEffect(() => {
    count.set(reduced ? value : withDelay(delay, withTiming(value, {
      duration: 400, easing: Easing.out(Easing.cubic),
    }, (finished) => {
      // TextInput reapplies its default on React renders; retain the settled
      // number without sending every animation frame to the JS thread.
      if (finished) scheduleOnRN(setFallback, value);
    })));
    return () => cancelAnimation(count);
  }, [value, delay, reduced, count]);
  const animatedProps = useAnimatedProps<TextInputProps & { text: string }>(() => ({
    text: Math.round(count.get()).toString(),
  }));
  return <View accessible accessibilityLabel={String(value)}>
    <AnimatedInput
      animatedProps={animatedProps}
      defaultValue={String(reduced ? value : fallback)}
      editable={false} caretHidden accessible={false} pointerEvents="none"
      style={[{ fontFamily: fonts.heading, color: c.ink, padding: 0 }, style]}
    />
  </View>;
}
