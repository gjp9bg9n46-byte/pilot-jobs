// A Pressable that acknowledges the touch: the surface sinks very slightly
// while held and springs back on release. Same gesture everywhere — cards,
// buttons, chips — so the whole app feels like one material.
import { ReactNode } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { DURATION, EASE_IN_OUT, PRESS_SCALE, timing } from '../theme/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function PressableScale({
  children, style, scaleTo = PRESS_SCALE, disabled, ...rest
}: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle>; scaleTo?: number }) {
  const pressed = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - scaleTo) }],
    opacity: 1 - pressed.value * 0.06,
  }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => { pressed.value = withTiming(1, timing(DURATION.fast, EASE_IN_OUT)); rest.onPressIn?.(e); }}
      onPressOut={(e) => { pressed.value = withTiming(0, timing(DURATION.base)); rest.onPressOut?.(e); }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}
