// ── Motion tokens ────────────────────────────────────────────────────────────
// One vocabulary for the whole app, so movement reads as one hand. Short and
// decelerating for anything that appears; a spring only where a surface is
// dragged or thrown (sheets), because that is where weight is believable.
//
// Everything here is interaction-driven. There are no entrance animations on
// scroll and no looping decoration — motion answers a touch or shows what
// changed, and otherwise the app holds still.
import { Easing, ReduceMotion } from 'react-native-reanimated';

export const DURATION = {
  /** State inside a control: a chip filling, a segment sliding. */
  fast: 120,
  /** The default: anything appearing, changing size, or settling. */
  base: 200,
  /** Content arriving — a skeleton handing over to real data. */
  slow: 320,
};

/** Decelerating: quick to start, soft to land. Standard for arrivals. */
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
/** Symmetric: for things that move and come back, like a press. */
export const EASE_IN_OUT = Easing.bezier(0.4, 0, 0.2, 1);

// ⚠️ A worklet may only call functions that are themselves worklets. Capturing
// a plain function in a worklet closure turns it into a "Remote Function" on
// the UI runtime, and CALLING it throws
//   [Worklets] Tried to synchronously call a Remote Function. Called "timing"
//   on the UI Runtime.
// inside a display-link callback, where nothing catches it — std::terminate,
// SIGABRT, the app is gone. That is exactly how build 2 crashed on Jobs and CV.
// The directive below makes this callable from either runtime; even so, prefer
// building the config on the JS thread (see TIMING_BASE) and keeping worklet
// bodies to pure arithmetic.
export const timing = (duration = DURATION.base, easing = EASE_OUT) => {
  'worklet';
  return { duration, easing, reduceMotion: ReduceMotion.System };
};

/** The default timing config, pre-built so no call is needed in a hot path. */
export const TIMING_BASE = { duration: DURATION.base, easing: EASE_OUT, reduceMotion: ReduceMotion.System } as const;
export const TIMING_FAST = { duration: DURATION.fast, easing: EASE_IN_OUT, reduceMotion: ReduceMotion.System } as const;

/** Sheets and anything the thumb throws. Damped — one settle, no bounce. */
export const SPRING = {
  damping: 22,
  stiffness: 260,
  mass: 0.9,
  overshootClamping: false,
  reduceMotion: ReduceMotion.System,
} as const;

/** How far a pressable sinks. Small enough to feel like pressure, not a jump. */
export const PRESS_SCALE = 0.98;
/** Image fade-in once decoded (expo-image transition). */
export const IMAGE_FADE_MS = 150;
