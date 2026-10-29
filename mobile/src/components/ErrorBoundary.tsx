// ── Error boundary ───────────────────────────────────────────────────────────
// One tab failing should cost you that tab, not the app. Wraps each screen so a
// render-time JS error becomes a message you can retry from.
//
// It also has to tell us what happened. A caught error produces no crash
// report, so TestFlight shows nothing and the only evidence is a screenshot of
// "Something went wrong" — which is how a Logbook error survived a whole build.
// Every catch now posts the error and the component stack to the server, and
// test builds show a Details line so the message can be read off the screen.
//
// Worth knowing what this does and does not catch: React boundaries catch
// errors thrown while rendering, in lifecycles and in effects — all on the JS
// thread. They CANNOT catch an exception thrown inside a worklet on the UI
// runtime: that one aborts the process natively before JS error handling runs,
// which is how build 2 died. The guard against that is the rule in
// theme/motion.ts — worklet bodies stay pure arithmetic.
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import api from '../lib/api';
import { ThemePalette, useThemedStyles } from '../theme/ThemeContext';
import { fontFamilies, fontSizes, spacing } from '../theme/tokens';

// Details are for the people testing the app, not for pilots. Set in the
// production (TestFlight) build profile; drop it from an App Store profile.
export const SHOW_ERROR_DETAILS =
  __DEV__ || process.env.EXPO_PUBLIC_ERROR_DETAILS === '1';

function buildLabel(): string {
  const v = Constants.expoConfig?.version || '?';
  const build = Platform.OS === 'ios'
    ? Constants.expoConfig?.ios?.buildNumber
    : String(Constants.expoConfig?.android?.versionCode ?? '');
  return build ? `${v} (${build})` : v;
}

function runtimeLabel(): string {
  // The update actually running, when there is one — otherwise the build's own
  // runtime. Without this a report cannot say which JS the pilot was on.
  const id = (Updates as { updateId?: string | null }).updateId;
  const channel = (Updates as { channel?: string | null }).channel;
  const rt = (Updates as { runtimeVersion?: string | null }).runtimeVersion;
  return [channel && `channel:${channel}`, rt && `runtime:${rt}`, id ? `update:${id}` : 'update:embedded']
    .filter(Boolean).join(' ');
}

/** Post a caught error to the server. Never throws, never blocks the UI. */
export async function reportClientError(
  error: Error, componentStack: string | null | undefined, screen: string,
): Promise<void> {
  try {
    await api.post('/app/client-error', {
      platform: Platform.OS,
      appVersion: buildLabel(),
      runtime: runtimeLabel(),
      screen,
      name: error?.name,
      message: String(error?.message || error),
      stack: error?.stack,
      componentStack: componentStack || null,
    });
  } catch {
    // Reporting a failure must never cause one.
  }
}

type Props = { children: React.ReactNode; label?: string };
type State = {
  error: Error | null;
  componentStack: string | null;
  // Bumped on every retry so the children remount rather than re-render with
  // the same hook state that just threw.
  attempt: number;
  // How many times this boundary has caught. A second catch means "Try again"
  // did not help, and the button has to say so instead of looking inert.
  caught: number;
  reported: 'pending' | 'sent' | 'failed';
  showStack: boolean;
};

const EMPTY: Omit<State, 'attempt' | 'caught'> = {
  error: null, componentStack: null, reported: 'pending', showStack: false,
};

class Boundary extends React.Component<Props & { styles: Fallback }, State> {
  state: State = { ...EMPTY, attempt: 0, caught: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, reported: 'pending', showStack: false };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const screen = this.props.label || 'screen';
    // Kept in the device log too, so a console capture has something to show.
    // eslint-disable-next-line no-console
    console.error(`[${screen}] ${error.message}`, info.componentStack);
    this.setState((s) => ({ componentStack: info.componentStack ?? null, caught: s.caught + 1 }));
    reportClientError(error, info.componentStack, screen)
      .then(() => this.setState({ reported: 'sent' }))
      .catch(() => this.setState({ reported: 'failed' }));
  }

  retry = () => {
    // Remount the subtree. Clearing `error` alone re-rendered the very same
    // children with the very same state, so a deterministic error redrew the
    // same screen and the button looked dead.
    this.setState((s) => ({ ...EMPTY, attempt: s.attempt + 1, caught: s.caught }));
  };

  render() {
    const { error, attempt, caught, reported, componentStack, showStack } = this.state;
    if (!error) return <React.Fragment key={attempt}>{this.props.children}</React.Fragment>;
    const styles = this.props.styles;
    const triedAlready = caught > 1;
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          {triedAlready
            ? 'This screen is still failing. Your data is safe — nothing was lost, and the rest of the app works.'
            : 'This screen stopped unexpectedly. Your data is safe — nothing was lost.'}
        </Text>
        <Pressable style={styles.btn} onPress={this.retry} accessibilityRole="button">
          <Text style={styles.btnText}>{triedAlready ? 'Try once more' : 'Try again'}</Text>
        </Pressable>
        {triedAlready ? (
          <Text style={styles.tried}>Tried {caught - 1} {caught - 1 === 1 ? 'time' : 'times'}</Text>
        ) : null}

        {SHOW_ERROR_DETAILS ? (
          <View style={styles.details}>
            <Pressable onPress={() => this.setState({ showStack: !showStack })} accessibilityRole="button">
              <Text style={styles.detailsLink}>
                Details {showStack ? '▾' : '▸'}
                {reported === 'sent' ? ' · reported' : reported === 'failed' ? ' · not reported' : ' · reporting…'}
              </Text>
            </Pressable>
            <Text selectable style={styles.detail}>
              {this.props.label || 'screen'} · {buildLabel()}{'\n'}{error.name}: {error.message}
            </Text>
            {showStack ? (
              <ScrollView style={styles.stackBox} nestedScrollEnabled>
                <Text selectable style={styles.stack}>
                  {error.stack || '(no stack)'}
                  {componentStack ? `\n\nComponent stack:${componentStack}` : ''}
                </Text>
              </ScrollView>
            ) : null}
          </View>
        ) : null}
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
  tried: { fontFamily: fontFamilies.body, fontSize: fontSizes.xs, color: pilot.faint },
  details: { marginTop: 18, alignSelf: 'stretch', maxWidth: 480, gap: 6 },
  detailsLink: { fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm, color: pilot.navy, textAlign: 'center' },
  detail: { fontFamily: fontFamilies.mono, fontSize: 11, color: pilot.muted, textAlign: 'center' },
  stackBox: { maxHeight: 220, backgroundColor: pilot.surface, borderRadius: 8, borderWidth: 1, borderColor: pilot.line, padding: 10 },
  stack: { fontFamily: fontFamilies.mono, fontSize: 10, color: pilot.muted, lineHeight: 14 },
});
