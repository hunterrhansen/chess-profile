import { useEffect, useState } from "react";
import { type StyleProp, type TextStyle } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { Text } from "@/components/ui";

/** Browser counterpart of web useCountUp; native uses animated text on the UI thread. */
export function CompletionCount({ value, delay, style }: {
  value: number;
  delay: number;
  style?: StyleProp<TextStyle>;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const timer = setTimeout(() => {
      const start = performance.now();
      frame = requestAnimationFrame(function step(now) {
        const t = Math.min(1, (now - start) / 400);
        setShown(Math.round(value * (1 - (1 - t) ** 3)));
        if (t < 1) frame = requestAnimationFrame(step);
      });
    }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); };
  }, [value, delay, reduced]);
  return <Text heading accessibilityLabel={String(value)} style={style}>{reduced ? value : shown}</Text>;
}
