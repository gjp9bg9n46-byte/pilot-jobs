// Floating pill-style bottom tab bar. Shared between the (tabs) layout and
// screens that hide/restore the bar (e.g. job detail, which has its own sticky
// Apply CTA that must not sit behind the floating bar). Theme-aware: build the
// style from the active palette via makeTabBarStyle(useThemeColors()).
import { ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemePalette } from './ThemeContext';

export function makeTabBarStyle(p: ThemePalette): ViewStyle {
  return {
    position: 'absolute',
    // marginHorizontal (not left/right) — react-navigation's tab bar wrapper can
    // override left/right offsets, which made the bar render edge-to-edge.
    marginHorizontal: 14,
    bottom: 24,
    // A#2 — the label's descenders were clipped by the pill's bottom edge
    // (icon 24 + label lineHeight 12 + padding did not fit in 66). Taller pill,
    // tighter vertical padding: 6 + 24 + 12 + 10 = 52 inside a 72pt bar.
    height: 72,
    borderRadius: 36,
    backgroundColor: p.surface,
    borderTopWidth: 0,
    paddingTop: 6,
    paddingBottom: 10,
    // Items must not reach the pill's curved ends, or the active highlight
    // squares off the corner (the bar can't use overflow:'hidden' — that was
    // what clipped the labels horizontally, the "Dashboarc" bug).
    paddingHorizontal: 10,
    shadowColor: '#0F1B2D',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  };
}

// Scroll content under the floating bar needs this much bottom padding so the
// last row can scroll clear of it (bar height 72 + bottom offset 24 + breathing room).
export const TAB_BAR_CLEARANCE = 128;

// A screen with the floating + button needs more: the FAB sits at bottom 104
// and is 58 tall, so its top edge is 162 up. Content has to be able to scroll
// clear of THAT, not just of the bar — this is what left the arrival time on
// the last flight row, "+28 more jobs…" and "2,000 Next" sitting under it.
export const FAB_CLEARANCE = 178;

// A#3 — the floating bar hid the bottom of every screen that didn't opt in, and
// the screens that did opt in hard-coded 116 without the safe area. Use this on
// EVERY scrollable surface inside the (tabs) group:
//   contentContainerStyle={[styles.content, { paddingBottom: useTabBarClearance() }]}
// Screens that hide the bar (job detail) don't need it.
export function useTabBarClearance(extra = 0): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_CLEARANCE + insets.bottom + extra;
}

/** For a screen with the floating + button. */
export function useFabClearance(extra = 0): number {
  const insets = useSafeAreaInsets();
  return FAB_CLEARANCE + insets.bottom + extra;
}
