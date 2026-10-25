// The "+" on the Logbook: three ways in, scanning first because it is the
// fastest. Straight from the mockup's first screen.
import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SPRING, timing } from '../../theme/motion';
import { tapMedium } from '../../lib/haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontFamilies, fontSizes, layout, spacing } from '../../theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../theme/ThemeContext';

type Props = {
  visible: boolean;
  onClose: () => void;
  onScan: () => void;
  onManual: () => void;
  onImport: () => void;
  scansLeft?: number | null;
  // Scanning ships dark; until the server enables it the sheet simply does not
  // offer it, rather than offering something that answers 503.
  scanEnabled?: boolean;
};

export default function AddFlightSheet({ visible, onClose, onScan, onManual, onImport, scansLeft, scanEnabled = false }: Props) {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);

  const option = (
    key: string, icon: keyof typeof Ionicons.glyphMap, title: string, body: string,
    onPress: () => void, main = false, beta = false,
  ) => (
    <Pressable key={key} onPress={() => { onClose(); onPress(); }} style={[styles.opt, main && styles.optMain]}>
      <View style={[styles.ic, !main && styles.icSoft]}>
        <Ionicons name={icon} size={20} color={main ? '#fff' : pilot.navy} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.titleRow}>
          <Text style={styles.optTitle}>{title}</Text>
          {main ? <Text style={styles.tag}>Fastest</Text> : null}
          {beta ? <Text style={styles.beta}>Beta</Text> : null}
        </View>
        <Text style={styles.optBody}>{body}</Text>
      </View>
    </Pressable>
  );

  // The sheet is thrown up under the thumb, so it settles on a damped spring
  // rather than a fixed slide — the one place in the app where weight should be
  // believable. The dim behind it is a plain fade, so only one thing moves.
  const insets = useSafeAreaInsets();
  const shown = useSharedValue(0);
  useEffect(() => {
    if (visible) { tapMedium(); shown.value = withSpring(1, SPRING); }
    else { shown.value = withTiming(0, timing()); }
  }, [visible, shown]);
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - shown.value) * 320 }],
  }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: shown.value }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, dimStyle]}>
        <Pressable style={styles.dim} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.sm) + layout.cardPad }, sheetStyle]}>
        <View style={styles.grab} />
        <Text style={styles.h3}>Add a flight</Text>
        <Text style={styles.sub}>Every sector you flew today, in under a minute.</Text>
        {/* One gap value between the options, and none after the last — the
            sheet's own bottom padding closes it. */}
        <View style={styles.options}>
        {scanEnabled ? option('scan', 'scan-outline', 'Scan voyage report',
          scansLeft != null && scansLeft <= 0
            ? 'No scans left today — enter the flight manually.'
            : 'Take a photo. We read every sector — we ask about anything we could not read.',
          onScan, true, true) : null}
        {option('manual', 'create-outline', 'Enter manually',
          'Type the times yourself. Route, aircraft and crew are remembered from your last flight.', onManual, !scanEnabled)}
        {option('import', 'download-outline', 'Import a file',
          "ForeFlight, LogTen or a CSV from your airline's system.", onImport)}
        </View>
      </Animated.View>
    </Modal>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(11,31,58,0.45)' },
  // The sheet sizes itself to its three options: screen padding all round, the
  // home-indicator inset below (not a guessed 38), and one gap value between
  // cards. It used to end in a band of empty space under the last option.
  sheet: {
    backgroundColor: pilot.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: layout.screenX, paddingTop: layout.screenX,
  },
  grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#D5DCE5', alignSelf: 'center', marginBottom: layout.cardGap },
  h3: { fontFamily: fontFamilies.display, fontSize: 22, fontWeight: '600', color: pilot.ink },
  sub: { fontSize: 13.5, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: spacing.xs, marginBottom: layout.cardPad },
  opt: {
    flexDirection: 'row', gap: layout.cardGap, alignItems: 'center',
    borderWidth: 1, borderColor: pilot.line, borderRadius: 12,
    padding: layout.cardPad,
  },
  options: { gap: layout.cardGap },
  optMain: { borderColor: pilot.navy, backgroundColor: '#F4F8FD' },
  ic: { width: 40, height: 40, borderRadius: 10, backgroundColor: pilot.navy, alignItems: 'center', justifyContent: 'center' },
  icSoft: { backgroundColor: '#EEF2F7' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  optTitle: { fontSize: fontSizes.base, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink },
  tag: { fontSize: 11, fontFamily: fontFamilies.bodyBold, color: pilot.navy, backgroundColor: '#E3ECF8', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  beta: { fontSize: 10, fontFamily: fontFamilies.bodyBold, color: '#B45309', backgroundColor: '#FDF1DD', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2, overflow: 'hidden', textTransform: 'uppercase' },
  optBody: { fontSize: 13, color: pilot.muted, lineHeight: 19, fontFamily: fontFamilies.body, marginTop: 2 },
});
