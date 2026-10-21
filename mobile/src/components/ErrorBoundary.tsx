// ── Error boundary ───────────────────────────────────────────────────────────
// One tab failing should cost you that tab, not the app. Wraps each screen so a
// render-time JS error becomes a message you can retry from.
//
// Worth knowing what this does and does not catch: React boundaries catch
// errors thrown while rendering, in lifecycles and in effects — all on the JS
// thread. They CANNOT catch an exception thrown inside a worklet on the UI
// runtime: that one aborts the process natively before JS error handling runs,
// which is how build 2 died. The guard against that is the rule in
// theme/motion.ts — worklet bodies stay pure arithmetic.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ThemePalette, useThemedStyles } from '../theme/ThemeContext';
import { fontFamilies, fontSizes, spacing } from '../theme/tokens';

type Props = { children: React.ReactNode; label?: string };
type State = { error: Error | null };

class Boundary extends React.Component<Props & { styles: Fallback }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Kept in the device log so a TestFlight report has something to point at.
    // eslint-disable-next-line no-console
    console.error(`[${this.props.label || 'screen'}] ${error.message}`, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const styles = this.props.styles;
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          This screen stopped unexpectedly. Your data is safe — nothing was lost.
        </Text>
        <Pressable style={styles.btn} onPress={() => this.setState({ error: null })} accessibilityRole="button">
          <Text style={styles.btnText}>Try again</Text>
        </Pressable>
        {__DEV__ ? <Text style={styles.detail}>{error.message}</Text> : null}
      </View>
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fallback = any;

export default function ErrorBoundary({ children, label }: Props) {
  const styles = useThemedStyles(createStyles);
  return <Boundary label={label} styles={styles}>{children}</Boundary>;
}

/** Wrap a screen component so a render error shows the fallback, not a crash. */
export function withErrorBoundary<P extends object>(Screen: React.ComponentType<P>, label: string) {
  const Wrapped = (props: P) => (
    <ErrorBoundary label={label}><Screen {...props} /></ErrorBoundary>
  );
  Wrapped.displayName = `withErrorBoundary(${label})`;
  return Wrapped;
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: spacing.xl, backgroundColor: pilot.cream },
  title: { fontFamily: fontFamilies.display, fontSize: fontSizes['2xl'], color: pilot.ink },
  body: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, color: pilot.muted, textAlign: 'center', lineHeight: 21, maxWidth: 320 },
  btn: { marginTop: 6, paddingHorizontal: 18, height: 44, borderRadius: 10, backgroundColor: pilot.navy, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.base },
  detail: { marginTop: 12, fontFamily: fontFamilies.mono, fontSize: 11, color: pilot.faint, textAlign: 'center' },
});
