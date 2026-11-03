// App-wide theme (light / dark), persisted via the same secure store the auth
// token uses. The dark half is currently switched OFF — see DARK_MODE_ENABLED
// below, which is the single place that decides.
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
  page: string; cream: string; surface: string; ink: string; muted: string; faint: string; line: string;
  navy: string; navyHover: string; navyDeep: string; accentSoft: string; amber: string;
};
export type ThemeMode = 'light' | 'dark';

export const lightPalette: ThemePalette = { ...lightTokens };

// Dark mode left untouched this pass (no beige; its amber is decorative there).
export const darkPalette: ThemePalette = {
  page: '#0A1628',
  cream: '#0A1628', // page background — deep landing-page navy (true dark)
  surface: '#14253F', // cards — lifted a step above the background
  ink: '#F2F5FA',
  muted: '#93A5C0',
  faint: '#6E7F99',
  line: 'rgba(255,255,255,0.14)',
  navy: '#6FA9E0', // accent lightened for contrast on navy surfaces
  navyHover: '#8FBCE8',
  navyDeep: '#0A1628',
  accentSoft: '#6FA9E0',
  amber: '#F0A84B',
};

// ── THE SWITCH ───────────────────────────────────────────────────────────────
// Dark mode is OFF for now (2026-11-02, owner's call): the palette needs
// another pass before it ships. Nothing below was deleted — flip this to true
// and the whole theme comes back, including the Settings toggle, the stored
// preference, and device-following keyboards and date pickers.
export const DARK_MODE_ENABLED: boolean = false;

// Native controls (software keyboard, iOS date picker) follow the DEVICE's
// appearance, not ours, so they have to be told explicitly. Spread these onto
// any TextInput / DateTimePicker and they follow the switch above rather than
// the phone — an iPhone in dark mode would otherwise show a black keyboard
// under our cream forms. app.json's userInterfaceStyle covers this in a native
// build; these props cover Expo Go and any host that ignores it.
export const lightInputProps: { keyboardAppearance?: 'light' | 'dark' | 'default' } =
  DARK_MODE_ENABLED ? {} : { keyboardAppearance: 'light' };
export const lightPickerProps: { themeVariant?: 'light' | 'dark' } =
  DARK_MODE_ENABLED ? {} : { themeVariant: 'light' };

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
    // A mode stored by an earlier build stays on disk, unread, so turning the
    // switch back on restores whatever the pilot last chose.
    if (!DARK_MODE_ENABLED) return;
    getItem(STORE_KEY).then((v) => { if (v === 'dark') setModeState('dark'); }).catch(() => {});
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    if (!DARK_MODE_ENABLED) return;
    setModeState(m);
    setItem(STORE_KEY, m).catch(() => {});
  }, []);

  const dark = DARK_MODE_ENABLED && mode === 'dark';
  const value = useMemo<ThemeContextValue>(() => ({
    mode: dark ? 'dark' : 'light',
    colors: dark ? darkPalette : lightPalette,
    setMode,
  }), [dark, setMode]);

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
