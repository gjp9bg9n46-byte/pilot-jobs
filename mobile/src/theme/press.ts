// Editorial-lift press feedback — mobile counterpart of the web's hover/press
// language. No hover on touch, so the whole effect lives in the press:
// a tiny settle (scale 0.98) plus a slight dim, released instantly.
import { StyleProp, ViewStyle } from 'react-native';

export const PRESS_FX: ViewStyle = { transform: [{ scale: 0.98 }], opacity: 0.9 };

/** Wrap static style(s) into a Pressable style-function with press feedback. */
export const withPress =
  (...base: StyleProp<ViewStyle>[]) =>
  ({ pressed }: { pressed: boolean }): StyleProp<ViewStyle>[] =>
    [...base, pressed ? PRESS_FX : null];
