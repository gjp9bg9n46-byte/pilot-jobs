// Floating pill-style bottom tab bar. Shared between the (tabs) layout and
// screens that hide/restore the bar (e.g. job detail, which has its own sticky
// Apply CTA that must not sit behind the floating bar). Theme-aware: build the
// style from the active palette via makeTabBarStyle(useThemeColors()).
import { ViewStyle } from 'react-native';
import { ThemePalette } from './ThemeContext';

export function makeTabBarStyle(p: ThemePalette): ViewStyle {
  return {
    position: 'absolute',
    // marginHorizontal (not left/right) — react-navigation's tab bar wrapper can
    // override left/right offsets, which made the bar render edge-to-edge.
    marginHorizontal: 28,
    bottom: 24,
    height: 64,
    borderRadius: 32,
    backgroundColor: p.surface,
    borderTopWidth: 0,
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 8,
    shadowColor: '#0F1419',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  };
}

// Scroll content under the floating bar needs this much bottom padding so the
// last row can scroll clear of it (bar height 64 + bottom offset 24 + breathing room).
export const TAB_BAR_CLEARANCE = 116;
