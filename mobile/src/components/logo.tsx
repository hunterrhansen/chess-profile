import { View } from "react-native";
import Svg, { Rect, Path, Circle, G } from "react-native-svg";
import { useTheme } from "../lib/theme";
import { Text } from "./ui";
const KNIGHT =
  "M30 88 L74 88 Q78 88 77 84 L72 66 Q81 54 80 40 Q78 21 60 12 L57 6 Q55 3 52 6 L48 13 Q41 14 35 19 L21 37 Q17 43 21 47 L26 52 Q30 55 35 52 L44 46 Q49 45 48 50 Q45 60 36 68 Q29 75 30 84 Z";
export function Logo() {
  const { colors: c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Svg width={38} height={38} viewBox="0 0 100 100" aria-hidden={true}>
        <Rect x="4" y="8" width="92" height="88" rx="22" fill={c.brandLip} />
        <Rect x="4" y="4" width="92" height="88" rx="22" fill={c.brand} />
        <Circle cx="72" cy="27" r="13" fill={c.gold} />
        <Circle cx="78.5" cy="22" r="11" fill={c.brand} />
        <G transform="translate(6 18) scale(.7)">
          <Path d={KNIGHT} fill={c.onBrand} />
          <Circle cx="50" cy="28" r="3.8" fill={c.brand} />
        </G>
      </Svg>
      <Text heading style={{ fontSize: 27, lineHeight: 34 }}>
        Knightly
      </Text>
    </View>
  );
}
