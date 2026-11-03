// What is actually running on this phone.
//
// Written because an update was published, the phone did not show it, and
// there was no way to tell from the device whether the problem was the binary,
// the channel, the runtime or simply that the new bundle had not been applied
// yet. Guessing at that from a laptop is not diagnosis.
//
// The values are deliberately the NATIVE ones. Constants.expoConfig.version
// comes from the JS manifest, so after an update it reports what the update
// says — which is the one thing you cannot trust when the question is "did the
// update land". nativeApplicationVersion and nativeBuildVersion come from the
// installed binary's Info.plist and cannot be changed by an update.
//
// Update ID is the opposite: it identifies the JS. "embedded" means the phone
// is running the bundle that shipped inside the binary — no update applied.
import { Text, View, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { fontFamilies, fontSizes, spacing } from '../theme/tokens';
import { ThemePalette, useThemedStyles } from '../theme/ThemeContext';

/** Never let a diagnostic line be the thing that breaks the screen. */
function read<T>(fn: () => T, fallback: T): T {
  try {
    const v = fn();
    return v === undefined || v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function buildInfoLines() {
  const version = read(() => Constants.nativeApplicationVersion, null as string | null);
  const build = read(() => Constants.nativeBuildVersion, null as string | null);
  const runtime = read(() => Updates.runtimeVersion, null as string | null);
  const channel = read(() => Updates.channel, null as string | null);
  const embedded = read(() => Updates.isEmbeddedLaunch, false);
  const id = read(() => Updates.updateId, null as string | null);

  return {
    // "Version 1.0.0 (9)" — the binary. In Expo Go both are null, hence the dash.
    first: `Version ${version ?? '—'} (${build ?? '—'})`,
    // The JS. Embedded means no update has been applied over the binary.
    second: embedded || !id
      ? `Update: embedded${runtime ? ` · runtime ${runtime}` : ''}`
      : `Update ${id.slice(0, 8)}${channel ? ` · ${channel}` : ''}${runtime ? ` · runtime ${runtime}` : ''}`,
  };
}

export default function BuildInfo() {
  const styles = useThemedStyles(createStyles);
  const { first, second } = buildInfoLines();
  return (
    <View style={styles.wrap} accessibilityRole="text" accessibilityLabel={`${first}. ${second}`}>
      <Text style={styles.line} selectable>{first}</Text>
      <Text style={styles.line} selectable>{second}</Text>
    </View>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.sm, gap: 2 },
  // Quiet: this is for the rare moment someone needs it, not a banner.
  line: { fontFamily: fontFamilies.mono, fontSize: fontSizes.xs, color: pilot.muted, textAlign: 'center' },
});
