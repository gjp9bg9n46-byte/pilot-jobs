// App-wide theme (light / dark) with an instant toggle, persisted via the same
// secure store the auth token uses.
//
// Light = the original editorial-light palette (cream bg, navy accent).
// Dark   = deep navy (#0A1628 — the landing-page navy, the darkest brand tone)
//          as the page background, slightly lifted navy cards, near-white ink,
//          and a lightened accent blue so links/buttons stay legible.
//          (Was #003F88 brand navy — owner flagged it as too light/bright.)
//
// Usage pattern (applied across the pilot screens):
//   const createStyles = (pilot: ThemePalette) => StyleSheet.create({ ... });
//   function Screen() {
//     const pilot = useThemeColors();               // themed inline colors
//     const styles = useThemedStyles(createStyles); // themed StyleSheet
//     ...
//   }
// Naming the hook result `pilot` intentionally shadows the static token import,
// so existing `pilot.x` references pick up the active theme with no rewrites.
import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { pilot as lightTokens } from './tokens';
import { getItem, setItem } from '../lib/secureStore';

export type ThemePalette = {
  cream: string; surface: string; ink: string; muted: string; line: string;
  navy: string; navyHover: string; amber: string;
};
export type ThemeMode = 'light' | 'dark';

export const lightPalette: ThemePalette = { ...lightTokens };

export const darkPalette: ThemePalette = {
  cream: '#0A1628', // page background — deep landing-page navy (true dark)
  surface: '#14253F', // cards — lifted a step above the background
  ink: '#F2F5FA',
  muted: '#93A5C0',
  line: 'rgba(255,255,255,0.14)',
  navy: '#6FA9E0', // accent lightened for contrast on navy surfaces
  navyHover: '#8FBCE8',
  amber: '#F0A84B',
};

const STORE_KEY = 'themeMode';

type ThemeContextValue = {
  mode: ThemeMode;
  colors: ThemePalette;
  setMode: (m: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'light',
  colors: lightPalette,
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('light');

  useEffect(() => {
    getItem(STORE_KEY).then((v) => { if (v === 'dark') setModeState('dark'); }).catch(() => {});
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    setItem(STORE_KEY, m).catch(() => {});
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    mode,
    colors: mode === 'dark' ? darkPalette : lightPalette,
    setMode,
  }), [mode, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export function useThemeColors(): ThemePalette {
  return useContext(ThemeContext).colors;
}

// Memoised themed StyleSheet — factory identity is stable (module const), so
// styles rebuild only when the palette flips.
export function useThemedStyles<T>(factory: (p: ThemePalette) => T): T {
  const colors = useThemeColors();
  return useMemo(() => factory(colors), [factory, colors]);
}
