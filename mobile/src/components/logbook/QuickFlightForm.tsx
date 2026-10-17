// Manual entry, short — the mockup's third phone screen.
//
// The role preset ("Airline First Officer" / "Airline Captain") decides whether
// the block counts as SIC or PIC and keeps the form to the fields an airline
// pilot actually fills: date, flight number, route, aircraft, the four times,
// who was flying, landings and the commander. Everything else lives under
// "More fields". Block and night are never typed — the server derives both from
// the times, and the value shown here is the same arithmetic.
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../lib/api';
import { getPendingFlight, clearPendingFlight } from '../../lib/pendingFlight';
import { minutesToHHMM, spanMinutes } from '../../lib/logbookFormat';
import { fontFamilies, fontSizes, spacing } from '../../theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../theme/ThemeContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const BLANK = {
  date: '', flightNumber: '', departure: '', arrival: '', aircraftType: '', registration: '',
  offBlocksTime: '', takeoffTime: '', landingTime: '', onBlocksTime: '',
  pilotFlying: false, landings: '', picName: '', approach: '', remarks: '',
};

export default function QuickFlightForm({ title = 'Log a flight' }: { title?: string }) {
  const pilot = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();

  // A return trip / next leg / duplicate hands the flight over in the holder.
  const handover = useMemo(() => { const f = getPendingFlight(); clearPendingFlight(); return f; }, []);
  const [form, setForm] = useState<Any>({ ...BLANK, ...(handover || {}) });
  const [prefs, setPrefs] = useState<Any>(null);
  const [more, setMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/logbook/prefs').then(({ data }) => {
      setPrefs(data);
      setForm((f: Any) => ({
        ...f,
        date: f.date || new Date().toISOString().slice(0, 10),
        aircraftType: f.aircraftType || data.last.aircraftType || '',
        registration: f.registration || data.last.registration || '',
        picName: f.picName || data.last.commander || '',
      }));
    }).catch(() => {});
  }, []);

  const set = (k: string) => (v: string) => setForm((f: Any) => ({ ...f, [k]: v }));
  const block = spanMinutes(form.offBlocksTime, form.onBlocksTime);

  const save = async () => {
    setSaving(true); setError(null);
    try {
      await api.post('/flight-logs', {
        ...form,
        landings: form.landings === '' ? undefined : Number(form.landings),
      });
      router.replace('/logbook');
    } catch (e: Any) {
      setError(e?.response?.data?.error || 'Could not save that flight.');
    } finally { setSaving(false); }
  };

  const field = (k: string, label: string, opts: { hint?: string; mono?: boolean; placeholder?: string; flex?: number } = {}) => (
    <View style={[styles.f, { flex: opts.flex ?? 1 }]} key={k}>
      <Text style={styles.label}>{label}{opts.hint ? <Text style={styles.hint}> · {opts.hint}</Text> : null}</Text>
      <TextInput
        value={String(form[k] ?? '')}
        onChangeText={set(k)}
        style={[styles.input, opts.mono && styles.mono]}
        placeholder={opts.placeholder}
        placeholderTextColor={pilot.faint}
        autoCapitalize="characters"
        autoCorrect={false}
        keyboardType={opts.mono ? 'numbers-and-punctuation' : 'default'}
      />
    </View>
  );

  const presetLabel = prefs?.rolePresets?.find((p: Any) => p.key === prefs.rolePreset)?.label;
  const nextPreset = prefs?.rolePreset === 'airline_captain' ? 'airline_fo' : 'airline_captain';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}><Ionicons name="close" size={22} color={pilot.ink} /></Pressable>
        <Text style={styles.barTitle}>{title}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        {prefs ? (
          <View style={styles.preset}>
            <Text style={styles.presetText}>Preset: <Text style={styles.presetName}>{presetLabel}</Text></Text>
            <Pressable onPress={async () => { const { data } = await api.put('/logbook/prefs', { rolePreset: nextPreset }); setPrefs(data); }}>
              <Text style={styles.change}>Change</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.row}>{field('date', 'Date', { placeholder: 'YYYY-MM-DD' })}{field('flightNumber', 'Flight no.', { placeholder: 'MSC 2926' })}</View>
        <View style={styles.row}>{field('departure', 'From', { placeholder: 'CAI' })}{field('arrival', 'To', { placeholder: 'HRG' })}</View>
        <View style={styles.row}>
          {field('aircraftType', 'Aircraft', { hint: prefs?.last?.aircraftType ? 'remembered' : undefined })}
          {field('registration', 'Registration', { hint: prefs?.last?.registration ? 'remembered' : undefined })}
        </View>
        <View style={styles.row}>
          {field('offBlocksTime', 'Out', { mono: true, placeholder: '07:26' })}
          {field('takeoffTime', 'Off', { mono: true, placeholder: '07:39' })}
          {field('landingTime', 'On', { mono: true, placeholder: '11:47' })}
          {field('onBlocksTime', 'In', { mono: true, placeholder: '11:53' })}
        </View>

        <View style={styles.row}>
          <View style={[styles.f, styles.calc]}>
            <Text style={styles.label}>Block <Text style={styles.hint}>· calc.</Text></Text>
            <Text style={styles.calcValue}>{minutesToHHMM(block)}</Text>
          </View>
          <View style={[styles.f, styles.calc]}>
            <Text style={styles.label}>Night <Text style={styles.hint}>· on save</Text></Text>
            <Text style={styles.calcValue}>from the sun</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.f, styles.toggle]}>
            <Text style={styles.toggleText}>Pilot flying</Text>
            <Switch value={!!form.pilotFlying} onValueChange={(v) => setForm((f: Any) => ({ ...f, pilotFlying: v }))} trackColor={{ true: '#16A34A', false: '#CBD3DD' }} thumbColor="#fff" />
          </View>
          {field('landings', 'Landings', { mono: true, placeholder: form.pilotFlying ? '1' : '0' })}
        </View>
        <View style={styles.row}>{field('picName', 'Commander', { hint: prefs?.last?.commander ? 'remembered' : undefined })}</View>

        <Pressable style={styles.more} onPress={() => setMore((m) => !m)}>
          <Text style={styles.moreText}>More fields</Text>
          <Text style={styles.moreHint}>{more ? 'Hide' : 'Approach, remarks…'}</Text>
        </Pressable>
        {more ? (
          <>
            <View style={styles.row}>{field('approach', 'Approach', { placeholder: 'ILS 34L' })}</View>
            <View style={styles.row}>{field('remarks', 'Remarks', { placeholder: 'Optional' })}</View>
          </>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.fixed}>
        <Pressable style={styles.btn} onPress={() => router.back()}><Text style={styles.btnText}>Cancel</Text></Pressable>
        <Pressable
          style={[styles.btn, styles.btnMain, (saving || !form.date || !form.departure || !form.arrival) && { opacity: 0.6 }]}
          disabled={saving || !form.date || !form.departure || !form.arrival}
          onPress={save}
        >
          <Text style={styles.btnMainText}>{saving ? 'Saving…' : 'Save flight'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  pad: { padding: spacing.xl, paddingBottom: 120 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: pilot.line, backgroundColor: pilot.surface },
  back: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  barTitle: { fontSize: 16, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink },

  preset: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F4F8FD', borderWidth: 1, borderColor: '#D3E1F2', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 12 },
  presetText: { fontSize: 12.5, color: pilot.ink, fontFamily: fontFamilies.body },
  presetName: { fontFamily: fontFamilies.bodySemiBold },
  change: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: 12.5 },

  row: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  f: { flex: 1 },
  label: { fontSize: 10.5, fontFamily: fontFamilies.bodySemiBold, color: pilot.faint, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 },
  hint: { textTransform: 'none', letterSpacing: 0, fontFamily: fontFamilies.body, fontSize: 11 },
  input: { height: 42, borderWidth: 1, borderColor: pilot.line, borderRadius: 8, paddingHorizontal: 10, fontSize: 14, color: pilot.ink, backgroundColor: pilot.surface, fontFamily: fontFamilies.body },
  mono: { fontVariant: ['tabular-nums'] },
  calc: { opacity: 0.95 },
  calcValue: { height: 42, borderWidth: 1, borderColor: pilot.line, borderRadius: 8, paddingHorizontal: 10, lineHeight: 42, fontSize: 14, color: pilot.muted, backgroundColor: '#F7F9FC', fontFamily: fontFamilies.body },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: pilot.line, borderRadius: 8, height: 42, paddingHorizontal: 12, backgroundColor: pilot.surface, marginTop: 15 },
  toggleText: { fontSize: 14, color: pilot.ink, fontFamily: fontFamilies.body },

  more: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: pilot.line, paddingTop: 12, marginTop: 6 },
  moreText: { fontSize: 13.5, fontFamily: fontFamilies.bodySemiBold, color: pilot.navy },
  moreHint: { fontSize: 12, color: pilot.faint, fontFamily: fontFamilies.body },
  error: { color: '#B42318', fontSize: 12.5, fontFamily: fontFamilies.body, marginTop: 12 },

  fixed: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, padding: 12, paddingBottom: 28, backgroundColor: pilot.surface, borderTopWidth: 1, borderTopColor: pilot.line },
  btn: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 10, borderWidth: 1, borderColor: pilot.line, backgroundColor: pilot.surface },
  btnMain: { backgroundColor: pilot.navy, borderColor: pilot.navy },
  btnText: { fontSize: fontSizes.base, fontFamily: fontFamilies.bodySemiBold, color: pilot.navy },
  btnMainText: { fontSize: fontSizes.base, fontFamily: fontFamilies.bodySemiBold, color: '#fff' },
});
