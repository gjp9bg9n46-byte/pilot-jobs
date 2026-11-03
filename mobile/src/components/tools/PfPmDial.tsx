// The dial — a heading indicator, not a prize wheel.
//
// A compass card carrying the two names 180° apart rotates under a fixed
// lubber line, spins four whole turns and eases to a stop with the winner at
// the top. The deceleration is the whole effect: no bounce, no flash, no
// colour change on landing.
//
// `size` comes from the caller (the screen measures the window), so the dial
// is the same instrument on a 375pt SE and a 430pt Pro Max.
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { ThemePalette, useThemedStyles } from '../../theme/ThemeContext';
import { fontFamilies } from '../../theme/tokens';

export const SPIN_MS = 1700;

export default function PfPmDial({
  size, targetDeg, names,
}: { size: number; targetDeg: number; names: [string, string] }) {
  const styles = useThemedStyles(createStyles);
  const deg = useSharedValue(0);

  useEffect(() => {
    // A cubic ease-out reads as an instrument settling rather than a wheel
    // being braked.
    deg.value = withTiming(targetDeg, { duration: SPIN_MS, easing: Easing.out(Easing.cubic) });
  }, [targetDeg, deg]);

  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${deg.value}deg` }] }));

  const ticks = [];
  for (let d = 0; d < 360; d += 10) {
    const major = d % 30 === 0;
    ticks.push(
      <Line
        key={d}
        x1="100" y1={major ? 12 : 15} x2="100" y2={major ? 23 : 20}
        stroke={major ? '#0B1F3A' : '#8592A3'}
        strokeWidth={major ? 1.6 : 1}
        transform={`rotate(${d} 100 100)`}
      />,
    );
  }

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Animated.View style={[{ width: size, height: size }, spin]}>
        <Svg viewBox="0 0 200 200" width={size} height={size}>
          <Circle cx="100" cy="100" r="96" fill="#FFFFFF" stroke="#0B1F3A" strokeWidth="3" />
          <Circle cx="100" cy="100" r="86" fill="none" stroke="#E3E8EF" strokeWidth="1" />
          {ticks}
          {/* The lower name is drawn upside-down on the card, exactly as on a
              real compass card, so it reads upright once it rotates to the top. */}
          <SvgText x="100" y="52" textAnchor="middle" fontSize="13" fontWeight="700"
                   fontFamily={fontFamilies.bodyBold} fill="#003F88">
            {trunc(names[0])}
          </SvgText>
          <SvgText x="100" y="155" textAnchor="middle" fontSize="13" fontWeight="700"
                   fontFamily={fontFamilies.bodyBold} fill="#003F88"
                   transform="rotate(180 100 148)">
            {trunc(names[1])}
          </SvgText>
          <G stroke="#0B1F3A" strokeWidth="2.4" strokeLinecap="round" fill="none">
            <Line x1="100" y1="86" x2="100" y2="118" />
            <Line x1="82" y1="100" x2="118" y2="100" />
            <Line x1="92" y1="114" x2="108" y2="114" />
          </G>
        </Svg>
      </Animated.View>

      {/* Fixed lubber line — the thing the result lands under. Does not rotate. */}
      <View style={styles.lubber} pointerEvents="none">
        <Svg viewBox="0 0 200 200" width={size} height={size}>
          <Polygon points="100,6 94,20 106,20" fill="#003F88" />
        </Svg>
      </View>
    </View>
  );
}

// A long name must not overflow the card. The full name is always in the text
// result underneath, so shortening here costs nothing.
function trunc(s: string) {
  const t = String(s || '').trim();
  return t.length > 14 ? `${t.slice(0, 13)}…` : t;
}

const createStyles = (_pilot: ThemePalette) => ({
  wrap: { alignSelf: 'center' as const, position: 'relative' as const },
  lubber: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 },
});
