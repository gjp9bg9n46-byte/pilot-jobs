// Shared flight form — powers Add (multi-leg), Edit (single leg, PATCH), and
// Clone (single leg, POST, date cleared). Mirrors AddFlightModal in
// frontend/src/pages/Logbook.jsx.
//
// Night/Day: when Dep+Arr+takeoff+landing are known AND both airports are in
// airports.json, web shows READ-ONLY auto Night + Day (civil twilight, SunCalc) —
// no manual override, no toggle. Otherwise a manual Night input + helper hint.
// Mirrored exactly.
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { isAxiosError } from 'axios';
import api from '../lib/api';
import { DateField, ErrorBanner, PrimaryButton, TextField } from './ui';
import AircraftCombobox from './AircraftCombobox';
import { blockTimeFromTimes } from '../lib/logbook';
import { computeNightHours, nightComputable } from '../lib/night';
import { fontFamilies, fontSizes, pilot, spacing } from '../theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../theme/ThemeContext';

export type Leg = Record<string, string>;
export const EMPTY_LEG: Leg = {
  flightNumber: '', departure: '', arrival: '', offBlocksTime: '', takeoffTime: '', landingTime: '', onBlocksTime: '',
  picName: '', sicName: '', picTime: '', sicTime: '', multiEngineTime: '', turbineTime: '', jetTime: '',
  crossCountryTime: '', instrumentActualTime: '', instrumentSimTime: '', nightManual: '',
  landingsDay: '', landingsNight: '', remarks: '',
};
const maskTime = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 4); return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`; };
const nf = (v: string) => parseFloat(String(v)) || 0;
const ni = (v: string) => parseInt(String(v)) || 0;
const str = (v: unknown) => (v == null ? '' : String(v));

// Map a stored flightLog → the leg form shape (for edit/clone prefill).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function legFromLog(log: Record<string, any>): Leg {
  return {
    flightNumber: str(log.flightNumber), departure: str(log.departure), arrival: str(log.arrival),
    offBlocksTime: str(log.offBlocksTime), takeoffTime: str(log.takeoffTime), landingTime: str(log.landingTime), onBlocksTime: str(log.onBlocksTime),
    picName: str(log.picName), sicName: str(log.sicName),
    picTime: log.picTime != null ? String(log.picTime) : '', sicTime: log.sicTime != null ? String(log.sicTime) : '',
    multiEngineTime: log.multiEngineTime != null ? String(log.multiEngineTime) : '', turbineTime: log.turbineTime != null ? String(log.turbineTime) : '',
    jetTime: log.jetTime != null ? String(log.jetTime) : '', crossCountryTime: log.crossCountryTime != null ? String(log.crossCountryTime) : '',
    instrumentActualTime: log.instrumentActualTime != null ? String(log.instrumentActualTime) : '', instrumentSimTime: log.instrumentSimTime != null ? String(log.instrumentSimTime) : '',
    nightManual: log.nightTime != null ? String(log.nightTime) : '',
    landingsDay: log.landingsDay != null ? String(log.landingsDay) : '', landingsNight: log.landingsNight != null ? String(log.landingsNight) : '',
    remarks: str(log.remarks),
  };
}

interface FlightFormProps {
  mode: 'new' | 'edit' | 'clone';
  editId?: string;
  title: string;
  initialDate?: string;
  initialAircraft?: string;
  initialRegistration?: string;
  initialLeg?: Leg;
}

export default function FlightForm({ mode, editId, title, initialDate, initialAircraft, initialRegistration, initialLeg }: FlightFormProps) {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const single = mode !== 'new';
  const [date, setDate] = useState(initialDate ?? new Date().toISOString().slice(0, 10));
  const [aircraftType, setAircraftType] = useState(initialAircraft ?? '');
  const [registration, setRegistration] = useState(initialRegistration ?? '');
  const [legs, setLegs] = useState<Leg[]>([initialLeg ?? { ...EMPTY_LEG }]);
  const [banner, setBanner] = useState('');
  const [saving, setSaving] = useState(false);

  const setLeg = (i: number, k: string, v: string) => setLegs((prev) => prev.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  const addLeg = () => setLegs((prev) => {
    const last = prev[prev.length - 1];
    return [...prev, { ...EMPTY_LEG, departure: last.arrival, picName: last.picName, sicName: last.sicName }];
  });
  const removeLeg = (i: number) => setLegs((prev) => prev.filter((_, idx) => idx !== i));

  const derived = useMemo(() => legs.map((leg) => {
    const block = blockTimeFromTimes(leg.offBlocksTime, leg.onBlocksTime);
    const computable = nightComputable(date, leg.takeoffTime, leg.landingTime, leg.departure, leg.arrival);
    const computedNight = computable ? computeNightHours(date, leg.takeoffTime, leg.landingTime, leg.departure, leg.arrival) : null;
    const dayHours = block !== null && computedNight !== null ? parseFloat(Math.max(0, block - computedNight).toFixed(2)) : null;
    return { block, computable, computedNight, dayHours };
  }), [legs, date]);

  const onSave = async () => {
    setBanner('');
    if (!date || !aircraftType.trim()) return setBanner('Date and aircraft type are required.');
    for (let i = 0; i < legs.length; i++) {
      if (derived[i].block === null) return setBanner(`${single ? '' : `Leg ${i + 1}: `}off-blocks and on-blocks times are required.`);
    }
    setSaving(true);
    try {
      const payloads = legs.map((leg, i) => {
        const d = derived[i];
        const nightHours = d.computedNight !== null ? d.computedNight : nf(leg.nightManual);
        return {
          date: new Date(date).toISOString(),
          flightNumber: leg.flightNumber, aircraftType: aircraftType.trim().toUpperCase(), registration: registration.trim(),
          departure: leg.departure, arrival: leg.arrival,
          offBlocksTime: leg.offBlocksTime, takeoffTime: leg.takeoffTime, landingTime: leg.landingTime, onBlocksTime: leg.onBlocksTime,
          picName: leg.picName, sicName: leg.sicName,
          totalTime: d.block ?? 0,
          picTime: nf(leg.picTime), sicTime: nf(leg.sicTime), multiEngineTime: nf(leg.multiEngineTime), turbineTime: nf(leg.turbineTime), jetTime: nf(leg.jetTime),
          instrumentActualTime: nf(leg.instrumentActualTime), instrumentSimTime: nf(leg.instrumentSimTime), crossCountryTime: nf(leg.crossCountryTime),
          nightTime: nightHours,
          landingsDay: ni(leg.landingsDay), landingsNight: ni(leg.landingsNight),
          remarks: leg.remarks,
        };
      });
      if (mode === 'edit') await api.patch(`/flight-logs/${editId}`, payloads[0]);
      else if (mode === 'clone') await api.post('/flight-logs', payloads[0]);
      else if (payloads.length === 1) await api.post('/flight-logs', payloads[0]);
      else await api.post('/flight-logs/bulk', { legs: payloads });
      router.replace('/logbook');
    } catch (err) {
      if (isAxiosError(err) && !err.response) setBanner("Couldn't reach the server — check your connection and try again.");
      else if (isAxiosError(err)) setBanner(err.response?.data?.error || 'Could not save flight. Please try again.');
      else setBanner('Could not save flight. Please try again.');
      setSaving(false);
    }
  };

  const saveLabel = saving ? 'Saving…' : mode === 'edit' ? 'Save Changes' : (!single && legs.length > 1) ? `Save ${legs.length} Legs` : 'Save Flight';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}><Text style={styles.cancel}>Cancel</Text></Pressable>
        <Text style={styles.topTitle}>{title}</Text>
        <View style={{ width: 54 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <ErrorBanner>{banner}</ErrorBanner>

          <Text style={styles.section}>Duty</Text>
          <View style={{ marginBottom: 14 }}><DateField label="Date" required value={date} onChange={setDate} clearable={mode === 'clone'} /></View>
          <View style={{ marginBottom: 14 }}><AircraftCombobox label="Aircraft Type" required value={aircraftType} onChange={setAircraftType} /></View>
          <View style={{ marginBottom: 14 }}><TextField label="Registration" placeholder="e.g. CS-TVA" value={registration} onChangeText={setRegistration} autoCapitalize="characters" /></View>

          {legs.map((leg, i) => (
            <LegCard key={i} index={i} single={single} leg={leg} derived={derived[i]} onField={(k, v) => setLeg(i, k, v)} onRemove={!single && legs.length > 1 ? () => removeLeg(i) : undefined} />
          ))}

          {!single ? (
            <Pressable style={styles.addLegBtn} onPress={addLeg}><Text style={styles.addLegText}>+ Add another leg</Text></Pressable>
          ) : null}

          <PrimaryButton label={saveLabel} loading={saving} onPress={onSave} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function LegCard({ index, single, leg, derived, onField, onRemove }: {
  index: number; single: boolean; leg: Leg;
  derived: { block: number | null; computable: boolean; computedNight: number | null; dayHours: number | null };
  onField: (k: string, v: string) => void; onRemove?: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const airportsEntered = !!(leg.takeoffTime && leg.landingTime && leg.departure && leg.arrival);
  const Num = (label: string, k: string) => (
    <View style={{ flex: 1 }}><View style={{ marginBottom: 14 }}><TextField label={label} value={str(leg[k])} onChangeText={(t) => onField(k, t)} keyboardType="decimal-pad" /></View></View>
  );
  return (
    <View style={styles.legCard}>
      {!single ? (
        <View style={styles.legHead}>
          <Text style={styles.legTitle}>Leg {index + 1}</Text>
          {onRemove ? <Pressable onPress={onRemove} hitSlop={8} style={styles.removeLeg}><Ionicons name="trash-outline" size={15} color="#991B1B" /><Text style={styles.removeLegText}> Remove</Text></Pressable> : null}
        </View>
      ) : null}

      <View style={{ marginBottom: 14 }}><TextField label="Flight Number" placeholder="e.g. QR435" value={str(leg.flightNumber)} onChangeText={(t) => onField('flightNumber', t)} autoCapitalize="characters" /></View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}><View style={{ marginBottom: 14 }}><TextField label="From" placeholder="OMDB" value={str(leg.departure)} onChangeText={(t) => onField('departure', t)} autoCapitalize="characters" /></View></View>
        <View style={{ flex: 1 }}><View style={{ marginBottom: 14 }}><TextField label="To" placeholder="EGLL" value={str(leg.arrival)} onChangeText={(t) => onField('arrival', t)} autoCapitalize="characters" /></View></View>
      </View>

      <Text style={styles.subhead}>Block &amp; Flight Times (UTC)</Text>
      <View style={styles.row}>
        <View style={{ flex: 1 }}><View style={{ marginBottom: 14 }}><TextField label="Off Blocks *" placeholder="HH:MM" value={str(leg.offBlocksTime)} onChangeText={(t) => onField('offBlocksTime', maskTime(t))} keyboardType="number-pad" /></View></View>
        <View style={{ flex: 1 }}><View style={{ marginBottom: 14 }}><TextField label="Takeoff" placeholder="HH:MM" value={str(leg.takeoffTime)} onChangeText={(t) => onField('takeoffTime', maskTime(t))} keyboardType="number-pad" /></View></View>
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}><View style={{ marginBottom: 14 }}><TextField label="Landing" placeholder="HH:MM" value={str(leg.landingTime)} onChangeText={(t) => onField('landingTime', maskTime(t))} keyboardType="number-pad" /></View></View>
        <View style={{ flex: 1 }}><View style={{ marginBottom: 14 }}><TextField label="On Blocks *" placeholder="HH:MM" value={str(leg.onBlocksTime)} onChangeText={(t) => onField('onBlocksTime', maskTime(t))} keyboardType="number-pad" /></View></View>
      </View>
      <Text style={styles.fieldLabel}>Block Time <Text style={styles.hint}>auto</Text></Text>
      <View style={[styles.readOnly, derived.block !== null && styles.readOnlyBlue]}>
        <Text style={[styles.readOnlyText, derived.block !== null && styles.readOnlyBlueText]}>{derived.block !== null ? `${derived.block.toFixed(2)} hrs` : 'Enter off / on blocks'}</Text>
      </View>

      <Text style={styles.subhead}>Night / Day Time</Text>
      {derived.computedNight !== null ? (
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Night Time <Text style={styles.hint}>civil twilight, auto</Text></Text>
            <View style={[styles.readOnly, styles.readOnlyBlue]}><Text style={[styles.readOnlyText, styles.readOnlyBlueText]}>{derived.computedNight.toFixed(2)} hrs</Text></View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Day Time <Text style={styles.hint}>auto</Text></Text>
            <View style={styles.readOnly}><Text style={styles.readOnlyText}>{derived.dayHours !== null ? `${derived.dayHours.toFixed(2)} hrs` : '—'}</Text></View>
          </View>
        </View>
      ) : (
        <>
          <View style={{ marginBottom: 6 }}><TextField label="Night Time" hint="manual entry" value={str(leg.nightManual)} onChangeText={(t) => onField('nightManual', t)} keyboardType="decimal-pad" /></View>
          <Text style={styles.nightHelp}>{airportsEntered ? 'Airport not in database — enter night time manually. Auto-calc requires departure and arrival ICAO codes.' : 'Fill in takeoff, landing, departure (From), and arrival (To) ICAO codes to auto-calculate.'}</Text>
        </>
      )}

      <Text style={styles.subhead}>Flight Hours <Text style={styles.hint}>decimals — 1h 30m = 1.5</Text></Text>
      <View style={styles.row}>{Num('PIC (Captain)', 'picTime')}{Num('SIC (Co-pilot)', 'sicTime')}</View>
      <View style={styles.row}>{Num('Multi-Engine', 'multiEngineTime')}{Num('Turbine', 'turbineTime')}</View>
      <View style={styles.row}>{Num('Jet', 'jetTime')}{Num('Cross-Country', 'crossCountryTime')}</View>
      <View style={styles.row}>{Num('IFR Actual (IMC)', 'instrumentActualTime')}{Num('IFR Sim', 'instrumentSimTime')}</View>

      <Text style={styles.subhead}>Landings</Text>
      <View style={styles.row}>
        <View style={{ flex: 1 }}><View style={{ marginBottom: 14 }}><TextField label="Day Landings" value={str(leg.landingsDay)} onChangeText={(t) => onField('landingsDay', t)} keyboardType="number-pad" /></View></View>
        <View style={{ flex: 1 }}><View style={{ marginBottom: 14 }}><TextField label="Night Landings" value={str(leg.landingsNight)} onChangeText={(t) => onField('landingsNight', t)} keyboardType="number-pad" /></View></View>
      </View>
      <View style={{ marginBottom: 4 }}><TextField label="Remarks" value={str(leg.remarks)} onChangeText={(t) => onField('remarks', t)} multiline /></View>
    </View>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: pilot.line },
  cancel: { color: pilot.navy, fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.base },
  topTitle: { fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.md, color: pilot.ink },
  content: { padding: spacing.xl, paddingBottom: 60 },
  section: { fontFamily: fontFamilies.display, fontSize: fontSizes.lg, color: pilot.ink, marginBottom: 12 },
  subhead: { fontFamily: fontFamilies.display, fontSize: fontSizes.base, color: pilot.ink, marginTop: 14, marginBottom: 12 },
  fieldLabel: { fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm, color: pilot.ink, marginBottom: 6 },
  hint: { color: pilot.muted, fontSize: fontSizes.xs, fontFamily: fontFamilies.body },
  nightHelp: { color: pilot.muted, fontSize: fontSizes.xs, fontFamily: fontFamilies.body, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 12 },
  legCard: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 12, padding: 16, marginBottom: 16 },
  legHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  legTitle: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: pilot.navy },
  removeLeg: { flexDirection: 'row', alignItems: 'center' },
  removeLegText: { color: '#991B1B', fontFamily: fontFamilies.bodyMedium, fontSize: fontSizes.sm },
  readOnly: { borderWidth: 1, borderColor: pilot.line, borderRadius: 6, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: pilot.cream },
  readOnlyText: { fontFamily: fontFamilies.body, fontSize: fontSizes.md, color: pilot.muted },
  readOnlyBlue: { borderColor: 'rgba(0,63,136,0.35)' },
  readOnlyBlueText: { color: pilot.navy, fontFamily: fontFamilies.bodyBold },
  addLegBtn: { borderWidth: 1, borderStyle: 'dashed', borderColor: pilot.navy, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: 'rgba(0,63,136,0.04)', marginBottom: 8 },
  addLegText: { color: pilot.navy, fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.base },
});
