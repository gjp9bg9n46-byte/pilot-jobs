// The full-screen map — the version with no native module in it.
//
// react-native-maps has no web build, and importing it from a route kills the
// whole web bundle because expo-router pulls every route in. Apple Maps lives
// in map.native.tsx, which wins on a device; this file is what web gets (and
// the fallback expo-router requires beside any platform-specific route): the
// SVG map it already had, given the window instead of a thumbnail.
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import RouteMap from '../../../src/components/logbook/RouteMap';
import { getPendingMap } from '../../../src/lib/pendingMap';
import { fontFamilies, fontSizes, layout, spacing } from '../../../src/theme/tokens';
import { ThemePalette, useThemedStyles } from '../../../src/theme/ThemeContext';

export default function FullScreenMapFallback() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { sectors, label, scope } = useMemo(() => getPendingMap(), []);
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.bar}>
        <Pressable style={styles.close} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close the map">
          <Ionicons name="close" size={22} color="#003F88" />
        </Pressable>
        <Text style={styles.title}>{label}</Text>
        <View style={{ width: 40 }} />
      </View>
      {/* explorable={false}: this IS the explored view. The native screen
          opens on every route ever flown; the SVG one still draws the page's
          sectors, which is what this component takes. */}
      <RouteMap sectors={sectors} height={Math.max(320, height - 180)} explorable={false} scope={scope} />
    </SafeAreaView>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream, padding: layout.screenX },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: pilot.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fontFamilies.display, fontSize: fontSizes.xl, color: pilot.ink },
});
