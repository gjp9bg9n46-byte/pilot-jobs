// ── Segmented control ────────────────────────────────────────────────────────
// The selected pill slides between options instead of blinking from one to the
// other, so the eye follows the change rather than re-finding it. This is the
// app's one piece of non-trivial motion: it answers a tap, it shows what moved,
// and it is the same control in the logbook (hh:mm / decimal), on Jobs and in
// the CV builder.
//
// Width is measured from the laid-out track, so it stays correct at any text
// size — no hard-coded pill width to drift.
import { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { TIMING_BASE } from '../theme/motion';
import { tapLight } from '../lib/haptics';
import { ThemePalette, useThemedStyles } from '../theme/ThemeContext';
import { fontFamilies } from '../theme/tokens';

export type SegmentOption<T extends string> = { value: T; label: string };

export default function Segmented<T extends string>({
  options, value, onChange, style, compact = false,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  style?: ViewStyle;
  compact?: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const [trackW, setTrackW] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const segW = trackW ? trackW / options.length : 0;

  // The animation is started on the JS thread and the worklet only reads a
  // shared value. The worklet body stays pure arithmetic — no calls out to
  // anything, which is the rule that keeps it off the UI runtime's remote-
  // function guard (see theme/motion.ts).
  const x = useSharedValue(0);
  useEffect(() => {
    const target = segW * index;
    if (!Number.isFinite(target)) return;      // pre-layout: segW is 0, never NaN
    x.value = withTiming(target, TIMING_BASE);
  }, [segW, index, x]);

  const pill = useAnimatedStyle(() => ({
    width: segW,
    transform: [{ translateX: x.value }],
    opacity: segW ? 1 : 0,
  }));

  const onLayout = (e: LayoutChangeEvent) => setTrackW(e.nativeEvent.layout.width);

  return (
    <View style={[styles.track, compact && styles.trackCompact, style]} onLayout={onLayout} accessibilityRole="tablist">
      <Animated.View style={[styles.pill, pill]} pointerEvents="none" />
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.seg, compact && styles.segCompact]}
            onPress={() => { if (!on) { tapLight(); onChange(o.value); } }}
          >
            <Text numberOfLines={1} style={[styles.label, compact && styles.labelCompact, on && styles.labelOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  track: {
    flexDirection: 'row', borderWidth: 1, borderColor: pilot.line, borderRadius: 10,
    backgroundColor: pilot.surface, overflow: 'hidden',
  },
  trackCompact: { borderRadius: 8 },
  pill: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: '#0B1F3A' },
  seg: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, paddingHorizontal: 10 },
  segCompact: { paddingVertical: 5, paddingHorizontal: 9 },
  label: { fontSize: 13, fontFamily: fontFamilies.bodySemiBold, color: pilot.muted },
  labelCompact: { fontSize: 12 },
  labelOn: { color: '#fff' },
});
