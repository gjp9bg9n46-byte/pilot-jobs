// The "+" on the Logbook: three ways in, scanning first because it is the
// fastest. Straight from the mockup's first screen.
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fontFamilies, fontSizes, spacing } from '../../theme/tokens';
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
    onPress: () => void, main = false,
  ) => (
    <Pressable key={key} onPress={() => { onClose(); onPress(); }} style={[styles.opt, main && styles.optMain]}>
      <View style={[styles.ic, !main && styles.icSoft]}>
        <Ionicons name={icon} size={20} color={main ? '#fff' : pilot.navy} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.titleRow}>
          <Text style={styles.optTitle}>{title}</Text>
          {main ? <Text style={styles.tag}>Fastest</Text> : null}
        </View>
        <Text style={styles.optBody}>{body}</Text>
      </View>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.dim} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.grab} />
        <Text style={styles.h3}>Add a flight</Text>
        <Text style={styles.sub}>Every sector you flew today, in under a minute.</Text>
        {scanEnabled ? option('scan', 'scan-outline', 'Scan voyage report',
          scansLeft != null && scansLeft <= 0
            ? 'No scans left today — enter the flight manually.'
            : 'Take a photo. We read every sector and you check it.',
          onScan, true) : null}
        {option('manual', 'create-outline', 'Enter manually',
          'Type the times yourself. Route, aircraft and crew are remembered from your last flight.', onManual, !scanEnabled)}
        {option('import', 'download-outline', 'Import a file',
          "ForeFlight, LogTen or a CSV from your airline's system.", onImport)}
      </View>
    </Modal>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(11,31,58,0.45)' },
  sheet: { backgroundColor: pilot.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl, paddingBottom: 38 },
  grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#D5DCE5', alignSelf: 'center', marginBottom: 14 },
  h3: { fontFamily: fontFamilies.display, fontSize: 22, fontWeight: '600', color: pilot.ink },
  sub: { fontSize: 13.5, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 4, marginBottom: 16 },
  opt: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', borderWidth: 1, borderColor: pilot.line, borderRadius: 12, padding: 14, marginBottom: 10 },
  optMain: { borderColor: pilot.navy, backgroundColor: '#F4F8FD' },
  ic: { width: 42, height: 42, borderRadius: 10, backgroundColor: pilot.navy, alignItems: 'center', justifyContent: 'center' },
  icSoft: { backgroundColor: '#EEF2F7' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  optTitle: { fontSize: fontSizes.base, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink },
  tag: { fontSize: 11, fontFamily: fontFamilies.bodyBold, color: pilot.navy, backgroundColor: '#E3ECF8', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  optBody: { fontSize: 13, color: pilot.muted, lineHeight: 19, fontFamily: fontFamilies.body, marginTop: 2 },
});
