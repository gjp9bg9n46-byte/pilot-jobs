// PF / PM — who flies, who monitors. Mirrors the public web tool at
// /tools/pf-pm, including the share card, which is the same 1080×1350 drawing
// so a card posted from the app and one from the web look identical.
//
// No backend, no storage: the names and sectors live in component state and
// are gone when the screen is.
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { WebView } from 'react-native-webview';
import { PrimaryButton, ScreenTitle, SecondaryButton, Subtitle } from '../../../src/components/ui';
import PfPmDial, { SPIN_MS } from '../../../src/components/tools/PfPmDial';
import { cardHtml } from '../../../src/lib/pfpmCardHtml';
import { DEFAULT_NAMES, Leg, MAX_SECTORS, decide, normaliseSector } from '../../../src/lib/pfpm';
import { notifyError, tapLight } from '../../../src/lib/haptics';
import { fontFamilies, fontSizes, layout, radii, spacing } from '../../../src/theme/tokens';
import { ThemePalette, lightInputProps, useThemedStyles } from '../../../src/theme/ThemeContext';

// A uniform byte's low bit is uniform, so there is no modulo bias to correct.
const cryptoBit = () => Crypto.getRandomBytes(1)[0] & 1;

export default function PfPmScreen() {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [names, setNames] = useState<string[]>([...DEFAULT_NAMES]);
  const [sectors, setSectors] = useState<string[]>(['']);
  const [alternate, setAlternate] = useState(true);
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'done'>('idle');
  const [rotation, setRotation] = useState(0);
  const [legs, setLegs] = useState<Leg[] | null>(null);
  const [note, setNote] = useState('');
  const [cardFor, setCardFor] = useState<{ legs: Leg[]; alternate: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The instrument sizes itself to the device: a readable floor on a 375pt SE,
  // a ceiling so it does not swamp a 430pt Pro Max.
  const dialSize = Math.max(220, Math.min(320, Math.round(width * 0.70)));

  const shown = useMemo(
    () => [names[0].trim() || DEFAULT_NAMES[0], names[1].trim() || DEFAULT_NAMES[1]] as [string, string],
    [names],
  );

  const run = useCallback(() => {
    if (phase === 'spinning') return;
    tapLight();
    const result = decide({
      names: shown,
      sectors: sectors.map(normaliseSector),
      alternate,
      randomBit: cryptoBit,
    });
    // Name 1 sits at the card's top, so 0° shows it and 180° shows name 2.
    // Four whole turns, then the part-turn that lands the winner on the line.
    const want = result[0].pf === 0 ? 0 : 180;
    const target = rotation + 4 * 360 + (want - (rotation % 360));
    setLegs(null);
    setNote('');
    setPhase('spinning');
    setRotation(target);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setLegs(result);
      setPhase('done');
      tapLight();          // the light tap as it lands
    }, SPIN_MS);
  }, [alternate, phase, rotation, sectors, shown]);

  // Share mounts the off-screen WebView; the card comes back through onMessage.
  const share = useCallback(() => {
    if (!legs) return;
    setNote('Preparing the card…');
    setCardFor({ legs, alternate: alternate && legs.length > 1 });
  }, [alternate, legs]);

  const onCard = useCallback(async (dataUrl: string) => {
    setCardFor(null);
    if (!dataUrl || dataUrl.startsWith('ERROR:')) {
      notifyError();
      setNote('Could not create the image.');
      return;
    }
    try {
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      const uri = `${FileSystem.cacheDirectory}pf-pm-cockpithire.png`;
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Who’s flying today?', UTI: 'public.png' });
        setNote('');
      } else {
        setNote('Sharing is not available on this device.');
      }
    } catch {
      notifyError();
      setNote('Could not share the image.');
    }
  }, []);

  const setSector = (i: number, v: string) => setSectors((s) => s.map((x, k) => (k === i ? v : x)));
  const addSector = () => { tapLight(); setSectors((s) => (s.length >= MAX_SECTORS ? s : [...s, ''])); };
  const removeSector = (i: number) => { tapLight(); setSectors((s) => (s.length <= 1 ? s : s.filter((_, k) => k !== i))); };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing['3xl'] }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ScreenTitle>PF / PM</ScreenTitle>
        <Subtitle>Who flies, who monitors. One fair spin of the dial.</Subtitle>

        <View style={styles.card}>
          <Text style={styles.label}>CREW</Text>
          {[0, 1].map((i) => (
            <View key={i} style={styles.field}>
              <Text style={styles.fieldLabel}>{i === 0 ? 'Pilot 1' : 'Pilot 2'}</Text>
              <TextInput
                {...lightInputProps}
                style={styles.input}
                value={names[i]}
                maxLength={28}
                placeholder={DEFAULT_NAMES[i]}
                placeholderTextColor="#9AA0A6"
                onChangeText={(v) => setNames((n) => n.map((x, k) => (k === i ? v : x)))}
              />
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>SECTORS <Text style={styles.optional}>optional</Text></Text>
          {sectors.map((s, i) => (
            <View key={i} style={styles.sectorRow}>
              <TextInput
                {...lightInputProps}
                style={[styles.input, styles.sectorInput]}
                value={s}
                maxLength={24}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder={i === 0 ? 'CAI–MXP' : 'MXP–HRG'}
                placeholderTextColor="#9AA0A6"
                accessibilityLabel={`Sector ${i + 1}`}
                onChangeText={(v) => setSector(i, v)}
              />
              {sectors.length > 1 ? (
                <Pressable
                  style={styles.remove}
                  onPress={() => removeSector(i)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove sector ${i + 1}`}
                >
                  <Text style={styles.removeText}>✕</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
          {sectors.length < MAX_SECTORS ? (
            <Pressable onPress={addSector} accessibilityRole="button">
              <Text style={styles.add}>+ Add sector</Text>
            </Pressable>
          ) : (
            <Text style={styles.hint}>Six sectors is the limit.</Text>
          )}

          {sectors.length > 1 ? (
            <View style={styles.altRow}>
              <View style={styles.altText}>
                <Text style={styles.altTitle}>Alternate legs</Text>
                <Text style={styles.hint}>One spin decides the first leg; the roles swap after it.</Text>
              </View>
              <Switch value={alternate} onValueChange={(v) => { tapLight(); setAlternate(v); }} />
            </View>
          ) : null}
        </View>

        <View style={styles.dialWrap}>
          <PfPmDial size={dialSize} targetDeg={rotation} names={shown} />
        </View>

        <PrimaryButton
          label={phase === 'spinning' ? 'Deciding…' : legs ? 'Decide again' : 'Decide'}
          onPress={run}
          disabled={phase === 'spinning'}
        />

        {phase === 'spinning' ? <Text style={styles.waiting}>The dial is settling…</Text> : null}

        {legs ? (
          <View style={styles.result}>
            {legs.map((leg, i) => (
              <View key={i} style={styles.leg}>
                {leg.sector ? <Text style={styles.legSector}>{leg.sector}</Text> : null}
                <Text style={styles.legRoles}>
                  <Text style={styles.pf}>PF {leg.pfName}</Text>
                  <Text style={styles.dot}>  ·  </Text>
                  <Text style={styles.pm}>PM {leg.pmName}</Text>
                </Text>
              </View>
            ))}
            <View style={styles.actions}>
              <SecondaryButton label="Share" onPress={share} />
            </View>
            {note ? <Text style={styles.note}>{note}</Text> : null}
          </View>
        ) : null}
      </ScrollView>

      {/* Off-screen card renderer. Mounted only while a share is in flight, so
          it costs nothing the rest of the time. */}
      {cardFor ? (
        <View style={styles.offscreen} pointerEvents="none">
          <WebView
            originWhitelist={['*']}
            source={{ html: cardHtml(cardFor.legs, cardFor.alternate) }}
            onMessage={(e) => onCard(e.nativeEvent.data)}
            javaScriptEnabled
            style={{ width: 1, height: 1, opacity: 0 }}
          />
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: pilot.cream },
  content: { paddingHorizontal: layout.screenX, paddingTop: layout.screenTop },

  card: {
    backgroundColor: pilot.surface, borderRadius: radii.md ?? 10,
    borderWidth: 1, borderColor: pilot.line,
    padding: layout.cardPad, marginBottom: layout.cardGap,
  },
  label: {
    fontFamily: fontFamilies.body, fontSize: fontSizes.xs, fontWeight: '700',
    letterSpacing: 1, color: pilot.muted, marginBottom: spacing.md,
  },
  optional: { fontWeight: '500', letterSpacing: 0, color: pilot.faint },

  field: { marginBottom: layout.rowGap + 4 },
  fieldLabel: { fontFamily: fontFamilies.body, fontSize: fontSizes.sm, color: pilot.muted, marginBottom: spacing.xs },
  input: {
    fontFamily: fontFamilies.body, fontSize: fontSizes.md, color: pilot.ink,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: pilot.line,
    borderRadius: radii.sm ?? 6, paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    // No fixed height: a larger accessibility font grows the field instead of
    // clipping the text inside it.
    minHeight: 46,
  },
  sectorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  sectorInput: { flex: 1, fontFamily: fontFamilies.mono, letterSpacing: 1 },
  remove: {
    width: 44, height: 44, borderRadius: radii.sm ?? 6, borderWidth: 1, borderColor: pilot.line,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
  },
  removeText: { color: pilot.muted, fontSize: fontSizes.base },
  add: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, fontWeight: '600', color: pilot.navy, paddingVertical: spacing.sm },
  hint: { fontFamily: fontFamilies.body, fontSize: fontSizes.sm, color: pilot.muted, flexShrink: 1 },

  altRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  altText: { flex: 1, minWidth: 0 },
  altTitle: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, fontWeight: '600', color: pilot.ink },

  dialWrap: { marginVertical: layout.sectionGap, alignItems: 'center' },

  waiting: { textAlign: 'center', color: pilot.muted, fontFamily: fontFamilies.body, fontSize: fontSizes.base, marginTop: spacing.md },

  result: { marginTop: layout.sectionGap },
  leg: {
    backgroundColor: pilot.surface, borderRadius: radii.md ?? 10, borderWidth: 1, borderColor: pilot.line,
    padding: layout.cardPad, marginBottom: spacing.sm,
  },
  legSector: { fontFamily: fontFamilies.mono, fontSize: fontSizes.base, color: pilot.navyDeep, letterSpacing: 1, marginBottom: spacing.xs },
  legRoles: { fontFamily: fontFamilies.body, fontSize: fontSizes.lg, flexWrap: 'wrap' },
  pf: { color: pilot.navy, fontWeight: '700' },
  dot: { color: pilot.faint },
  pm: { color: pilot.muted },

  actions: { marginTop: spacing.md },
  note: { textAlign: 'center', marginTop: spacing.md, color: pilot.muted, fontFamily: fontFamilies.body, fontSize: fontSizes.sm },

  offscreen: { position: 'absolute', width: 1, height: 1, left: -10, top: -10, opacity: 0 },
});
