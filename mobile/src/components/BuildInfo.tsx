// What is actually running on this phone, and whether updates reach it.
//
// Written because an update was published, the phone did not show it, and
// there was no way to tell from the device whether the cause was the binary,
// the channel, the runtime, or a download that silently failed. Everything
// that could be checked from a laptop checked out — the binary's Expo.plist,
// the channel, the runtime, the server's response to the device's exact
// headers — which left the on-device half unobservable. This makes it
// observable: tap, and the phone says what happened in its own words.
//
// The version and build are deliberately the NATIVE values.
// Constants.expoConfig.version comes from the JS manifest, so after an update
// it reports what the update says — the one thing you cannot trust when the
// question is whether the update landed. nativeApplicationVersion and
// nativeBuildVersion come from the installed binary's Info.plist and no update
// can change them.
import { useCallback, useState } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { fontFamilies, fontSizes, spacing } from '../theme/tokens';
import { ThemePalette, useThemedStyles } from '../theme/ThemeContext';

/** A diagnostic line must never be the thing that takes a screen down. */
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
    // The binary. Dashes in Expo Go and on web, where these are null.
    first: `Version ${version ?? '—'} (${build ?? '—'})`,
    // The JS over it. "embedded" = no update applied; still the binary's bundle.
    second: embedded || !id
      ? `Update: embedded${channel ? ` · ${channel}` : ''}${runtime ? ` · rt ${short(runtime)}` : ''}`
      : `Update ${id.slice(0, 8)}${channel ? ` · ${channel}` : ''}${runtime ? ` · rt ${short(runtime)}` : ''}`,
  };
}

// A fingerprint runtime is a 40-char hash; only the head is useful on a phone.
const short = (s: string) => (s.length > 12 ? `${s.slice(0, 8)}…` : s);

type State = { busy: boolean; msg: string | null; ready: boolean };

export default function BuildInfo() {
  const styles = useThemedStyles(createStyles);
  const { first, second } = buildInfoLines();
  const [s, setS] = useState<State>({ busy: false, msg: null, ready: false });

  const check = useCallback(async () => {
    setS({ busy: true, msg: 'Checking…', ready: false });
    try {
      const res = await Updates.checkForUpdateAsync();
      if (!res.isAvailable) {
        setS({ busy: false, ready: false, msg: 'No update available — this is the newest build for this runtime.' });
        return;
      }
      setS({ busy: true, msg: 'Update found. Downloading…', ready: false });
      const got = await Updates.fetchUpdateAsync();
      setS({
        busy: false,
        ready: !!got.isNew,
        msg: got.isNew ? 'Downloaded. Tap Restart to apply it.' : 'Already downloaded; restart to apply.',
      });
    } catch (e) {
      // The whole point: say what actually went wrong, not "something".
      setS({ busy: false, ready: false, msg: `Failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  }, []);

  const restart = useCallback(async () => {
    try { await Updates.reloadAsync(); } catch (e) {
      setS((p) => ({ ...p, msg: `Restart failed: ${e instanceof Error ? e.message : String(e)}` }));
    }
  }, []);

  return (
    <View style={styles.wrap}>
      <Text style={styles.line} selectable>{first}</Text>
      <Text style={styles.line} selectable>{second}</Text>

      <View style={styles.actions}>
        <Pressable onPress={check} disabled={s.busy} hitSlop={10}>
          <Text style={[styles.action, s.busy && styles.actionOff]}>
            {s.busy ? 'Checking…' : 'Check for update'}
          </Text>
        </Pressable>
        {s.ready ? (
          <Pressable onPress={restart} hitSlop={10}>
            <Text style={styles.action}>Restart</Text>
          </Pressable>
        ) : null}
      </View>

      {s.msg ? <Text style={styles.msg} selectable>{s.msg}</Text> : null}
    </View>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.sm, gap: 2 },
  // Quiet: for the rare moment someone needs it, not a banner.
  line: { fontFamily: fontFamilies.mono, fontSize: fontSizes.xs, color: pilot.muted, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  action: { fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm, color: pilot.navy },
  actionOff: { color: pilot.muted },
  msg: {
    fontFamily: fontFamilies.body, fontSize: fontSizes.xs, color: pilot.muted,
    textAlign: 'center', marginTop: spacing.xs, paddingHorizontal: spacing.lg, lineHeight: 18,
  },
});
