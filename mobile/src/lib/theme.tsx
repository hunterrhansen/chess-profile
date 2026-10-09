import { createContext, useContext, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { light, dark, type Palette } from "./colors";
export type ThemeMode = "system" | "light" | "dark";
const Context = createContext<{
  colors: Palette;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
} | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>("system");
  const isDark = mode === "dark" || (mode === "system" && system === "dark");
  return (
    <Context.Provider
      value={{ colors: isDark ? dark : light, isDark, mode, setMode }}
    >
      {children}
    </Context.Provider>
  );
}
export function useTheme() {
  const theme = useContext(Context);
  if (!theme) throw new Error("ThemeProvider is required");
  return theme;
}
export const fonts = {
  body: "Nunito_600SemiBold",
  bold: "Nunito_800ExtraBold",
  heading: "Fredoka_600SemiBold",
};
