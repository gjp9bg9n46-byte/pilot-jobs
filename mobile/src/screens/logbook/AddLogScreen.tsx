import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Switch, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { flightLogApi, profileApi } from '../../services/api';
import { addLog, addLogs, updateLog as updateLogAction } from '../../store';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import DatePickerInput from '../../components/DatePickerInput';
import BlockTimePicker, { computeNightHours } from './components/BlockTimePicker';
import AircraftPicker, { AircraftFlags } from './components/AircraftPicker';
import AirportPicker from './components/AirportPicker';
import LandingsField from './components/LandingsField';
import WarningList from './components/WarningList';
import type { LegState, RecentAircraft } from '../../types/logbook';
import type { Airport } from '../../types/airport';

const OUTBOX_KEY = 'flightlog_outbox';

// ─── Outbox helpers ────────────────────────────────────────────────────────────

async function enqueue(payload: any) {
  const raw = await AsyncStorage.getItem(OUTBOX_KEY);
  const q: any[] = raw ? JSON.parse(raw) : [];
  q.push({ outboxId: Math.random().toString(36).slice(2), payload, pendingAt: new Date().toISOString() });
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(q));
}

export async function drainOutbox(dispatch: any) {
  const raw = await AsyncStorage.getItem(OUTBOX_KEY);
  if (!raw) return;
  const q: any[] = JSON.parse(raw);
  const remaining: any[] = [];
  for (const item of q) {
    try {
      const { data } = await flightLogApi.create(item.payload);
      dispatch(addLog(data));
    } catch {
      remaining.push(item);
    }
  }
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(remaining));
}

// ─── Leg helpers ──────────────────────────────────────────────────────────────

function makeLeg(): LegState {
  return {
    key: Math.random().toString(36).slice(2),
    departure: '', arrival: '',
    depLat: null, depLon: null, arrLat: null, arrLon: null,
    blockOff: null, blockOn: null, totalTimeManual: '',
    picTime: 0, sicTime: 0, multiEngineTime: 0,
    turbineTime: 0, instrumentTime: 0,
    nightTime: 0, nightOverridden: false,
    landingsDay: 1, landingsNight: 0,
    collapsed: false,
  };
}

function legTotalTime(leg: LegState): number {
  if (leg.blockOff && leg.blockOn && leg.blockOn > leg.blockOff) {
    return (leg.blockOn.getTime() - leg.blockOff.getTime()) / 3_600_000;
  }
  return parseFloat(leg.totalTimeManual) || 0;
}

function fmtHours(h: number): string {
  const hrs = Math.floor(h);
  const min = Math.round((h - hrs) * 60);
  return min > 0 ? `${hrs}h ${min}m` : `${hrs}h`;
}

function buildWarnings(legs: LegState[]): string[] {
  const ws = new Set<string>();
  for (const leg of legs) {
    const tt = legTotalTime(leg);
    if (leg.picTime + leg.sicTime > tt + 0.02) ws.add('PIC + SIC exceeds total time');
    if (leg.nightTime > tt + 0.02) ws.add('Night time exceeds total time');
    if (leg.instrumentTime > tt + 0.02) ws.add('Instrument time exceeds total time');
    if (leg.multiEngineTime > tt + 0.02) ws.add('Multi-engine time exceeds total time');
    if (leg.turbineTime > tt + 0.02) ws.add('Turbine time exceeds total time');
    if (tt > 0 && leg.landingsDay + leg.landingsNight === 0) ws.add('No landings recorded');
    if (tt > 18) ws.add('Unusually long flight time — check entry');
  }
  return Array.from(ws);
}

// ─── Quick-add HoursField ─────────────────────────────────────────────────────

function HoursField({ label, value, onChange, max }: { label: string; value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <View style={s.hoursField}>
      <Text style={s.hoursLabel}>{label}</Text>
      <TextInput
        style={s.hoursInput}
        value={value === 0 ? '' : String(value)}
        onChangeText={(v) => onChange(parseFloat(v) || 0)}
        placeholder="0.0"
        placeholderTextColor="#4A6080"
        keyboardType="decimal-pad"
      />
      <View style={s.quickRow}>
        {([0.25, 0.5, 1] as const).map((d) => (
          <TouchableOpacity
            key={d}
            style={s.qChip}
            onPress={() => onChange(Math.min(max ?? 99, value + d))}
          >
            <Text style={s.qChipText}>{d === 0.25 ? '+15m' : d === 0.5 ? '+30m' : '+1h'}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ─── LegCard ──────────────────────────────────────────────────────────────────

interface LegCardProps {
  leg: LegState;
  index: number;
  flightDate: Date;
  multiLeg: boolean;
  recentIcaos: string[];
  onChange: (patch: Partial<LegState>) => void;
  onRemove?: () => void;
}

function LegCard({ leg, index, flightDate, multiLeg, recentIcaos, onChange, onRemove }: LegCardProps) {
  const tt = legTotalTime(leg);

  const recomputeNight = (
    blockOff: Date | null, blockOn: Date | null,
    depLat: number | null, depLon: number | null,
    arrLat: number | null, arrLon: number | null,
  ) => {
    if (!blockOff || !blockOn) return null;
    return computeNightHours(blockOff, blockOn, depLat, depLon, arrLat, arrLon);
  };

  const derivedNight = recomputeNight(leg.blockOff, leg.blockOn, leg.depLat, leg.depLon, leg.arrLat, leg.arrLon);

  const onBlockOffChange = (d: Date) => {
    const night = recomputeNight(d, leg.blockOn, leg.depLat, leg.depLon, leg.arrLat, leg.arrLon);
    onChange({
      blockOff: d,
      ...(!leg.nightOverridden && night != null ? { nightTime: parseFloat(night.toFixed(2)) } : {}),
    });
  };

  const onBlockOnChange = (d: Date) => {
    const night = recomputeNight(leg.blockOff, d, leg.depLat, leg.depLon, leg.arrLat, leg.arrLon);
    onChange({
      blockOn: d,
      ...(!leg.nightOverridden && night != null ? { nightTime: parseFloat(night.toFixed(2)) } : {}),
    });
  };

  const onDepSelect = (airport: Airport) => {
    const night = recomputeNight(leg.blockOff, leg.blockOn, airport.lat, airport.lon, leg.arrLat, leg.arrLon);
    onChange({
      departure: airport.icao, depLat: airport.lat, depLon: airport.lon,
      ...(!leg.nightOverridden && night != null ? { nightTime: parseFloat(night.toFixed(2)) } : {}),
    });
  };

  const onArrSelect = (airport: Airport) => {
    const night = recomputeNight(leg.blockOff, leg.blockOn, leg.depLat, leg.depLon, airport.lat, airport.lon);
    onChange({
      arrival: airport.icao, arrLat: airport.lat, arrLon: airport.lon,
      ...(!leg.nightOverridden && night != null ? { nightTime: parseFloat(night.toFixed(2)) } : {}),
    });
  };

  if (multiLeg && leg.collapsed) {
    return (
      <View style={s.legCard}>
        <TouchableOpacity style={s.legHeader} onPress={() => onChange({ collapsed: false })}>
          <Text style={s.legTitle}>
            Leg {index + 1}  {leg.departure || '?'} → {leg.arrival || '?'}{tt > 0 ? `  ·  ${fmtHours(tt)}` : ''}
          </Text>
          <View style={s.legHeaderRight}>
            {onRemove && (
              <TouchableOpacity onPress={onRemove} style={{ padding: 4 }}>
                <Ionicons name="close-circle-outline" size={18} color="#FF4757" />
              </TouchableOpacity>
            )}
            <Ionicons name="chevron-down" size={18} color="#7A8CA0" />
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[s.legCard, multiLeg && s.legCardMulti]}>
      {multiLeg && (
        <TouchableOpacity style={s.legHeader} onPress={() => onChange({ collapsed: true })}>
          <Text style={s.legTitle}>Leg {index + 1}</Text>
          <View style={s.legHeaderRight}>
            {onRemove && (
              <TouchableOpacity onPress={onRemove} style={{ padding: 4 }}>
                <Ionicons name="close-circle-outline" size={18} color="#FF4757" />
              </TouchableOpacity>
            )}
            <Ionicons name="chevron-up" size={18} color="#7A8CA0" />
          </View>
        </TouchableOpacity>
      )}

      {/* Route */}
      <Text style={s.sectionLabel}>Route</Text>
      <View style={s.routeRow}>
        <AirportPicker label="From" value={leg.departure} onSelect={onDepSelect} recentIcaos={recentIcaos} />
        <Ionicons name="arrow-forward" size={16} color="#4A6080" style={{ marginTop: 28 }} />
        <AirportPicker label="To" value={leg.arrival} onSelect={onArrSelect} recentIcaos={recentIcaos} />
      </View>

      {/* Block times */}
      <Text style={[s.sectionLabel, { marginTop: 14 }]}>Block times (UTC)</Text>
      <BlockTimePicker
        flightDate={flightDate}
        blockOff={leg.blockOff}
        blockOn={leg.blockOn}
        onBlockOffChange={onBlockOffChange}
        onBlockOnChange={onBlockOnChange}
      />

      {tt > 0 && (
        <View style={s.computedRow}>
          <Ionicons name="time-outline" size={14} color="#00B4D8" />
          <Text style={s.computedText}>
            Flight: {fmtHours(tt)} ({tt.toFixed(2)} hrs)
          </Text>
        </View>
      )}

      {!leg.blockOff && (
        <View style={{ marginTop: 8 }}>
          <Text style={s.sectionSubLabel}>No block times? Enter manually:</Text>
          <TextInput
            style={s.hoursInput}
            value={leg.totalTimeManual}
            onChangeText={(v) => onChange({ totalTimeManual: v })}
            placeholder="Total time in decimal hrs"
            placeholderTextColor="#4A6080"
            keyboardType="decimal-pad"
          />
        </View>
      )}

      {/* Hours */}
      <Text style={[s.sectionLabel, { marginTop: 14 }]}>Hours breakdown</Text>
      <View style={s.hoursGrid}>
        <HoursField label="PIC" value={leg.picTime} onChange={(v) => onChange({ picTime: v })} max={tt || 24} />
        <HoursField label="SIC / F/O" value={leg.sicTime} onChange={(v) => onChange({ sicTime: v })} max={tt || 24} />
        <HoursField label="Multi-Engine" value={leg.multiEngineTime} onChange={(v) => onChange({ multiEngineTime: v })} max={tt || 24} />
        <HoursField label="Turbine" value={leg.turbineTime} onChange={(v) => onChange({ turbineTime: v })} max={tt || 24} />
        <HoursField label="IMC / Instrument" value={leg.instrumentTime} onChange={(v) => onChange({ instrumentTime: v })} max={tt || 24} />
      </View>

      {/* Night */}
      <View style={s.nightRow}>
        <View style={{ flex: 1 }}>
          <HoursField
            label={`Night${derivedNight != null && !leg.nightOverridden ? ' (auto ✓)' : ''}`}
            value={leg.nightTime}
            onChange={(v) => onChange({ nightTime: v, nightOverridden: true })}
            max={tt || 24}
          />
        </View>
        {derivedNight != null && leg.nightOverridden && (
          <TouchableOpacity
            style={s.autoBtn}
            onPress={() => onChange({ nightTime: parseFloat(derivedNight.toFixed(2)), nightOverridden: false })}
          >
            <Ionicons name="refresh-outline" size={13} color="#00B4D8" />
            <Text style={s.autoBtnText}>Reset to {fmtHours(derivedNight)}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Landings */}
      <Text style={[s.sectionLabel, { marginTop: 14 }]}>Landings</Text>
      <View style={s.landingsRow}>
        <LandingsField label="Day" value={leg.landingsDay} onChange={(v) => onChange({ landingsDay: v })} />
        <LandingsField label="Night" value={leg.landingsNight} onChange={(v) => onChange({ landingsNight: v })} />
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AddLogScreen({ navigation, route }: any) {
  const dispatch = useAppDispatch();
  const { logs } = useAppSelector((s) => s.logbook);

  const params = route?.params;
  const isEdit = params?.mode === 'edit' && !!params?.logId;

  const [flightDate, setFlightDate] = useState<Date>(new Date());
  const [aircraftType, setAircraftType] = useState('');
  const [registration, setRegistration] = useState('');
  const [multiEngine, setMultiEngine] = useState(false);
  const [turbine, setTurbine] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [legs, setLegs] = useState<LegState[]>([makeLeg()]);
  const [typeRatings, setTypeRatings] = useState<string[]>([]);
  const [recent, setRecent] = useState<RecentAircraft>({ types: [], regByType: {} });
  const [saving, setSaving] = useState(false);

  const recentIcaos = useMemo(() => {
    const codes = new Set<string>();
    for (const l of logs) {
      if (l.departure) codes.add(l.departure);
      if (l.arrival) codes.add(l.arrival);
    }
    return Array.from(codes).slice(0, 8);
  }, [logs]);

  useEffect(() => {
    profileApi.get()
      .then(({ data }) => setTypeRatings((data.ratings ?? []).map((r: any) => r.aircraftType)))
      .catch(() => {});
    flightLogApi.recentAircraft()
      .then(({ data }) => setRecent(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const prefill = params?.prefill;
    const logId = params?.logId;
    const mode: string | undefined = params?.mode;

    const applyPrefill = (src: any, swapRoute = false) => {
      setFlightDate(src.date ? new Date(src.date) : new Date());
      setAircraftType(src.aircraftType ?? '');
      setRegistration(src.registration ?? '');
      setRemarks(src.remarks ?? '');
      const leg = makeLeg();
      leg.departure       = swapRoute ? (src.arrival ?? '') : (src.departure ?? '');
      leg.arrival         = swapRoute ? (src.departure ?? '') : (src.arrival ?? '');
      leg.totalTimeManual = String(src.totalTime ?? '');
      leg.picTime         = src.picTime ?? 0;
      leg.sicTime         = src.sicTime ?? 0;
      leg.multiEngineTime = src.multiEngineTime ?? 0;
      leg.turbineTime     = src.turbineTime ?? 0;
      leg.instrumentTime  = src.instrumentTime ?? 0;
      leg.nightTime       = src.nightTime ?? 0;
      leg.landingsDay     = src.landingsDay ?? 1;
      leg.landingsNight   = src.landingsNight ?? 0;
      setLegs([leg]);
    };

    if (prefill) {
      applyPrefill(prefill, mode === 'reverse');
      if (mode === 'clone' || mode === 'reverse') {
        setFlightDate(new Date());
        setRemarks('');
      }
    } else if (isEdit && logId) {
      const existing = logs.find((l) => l.id === logId);
      if (existing) applyPrefill(existing);
    }
  }, []);

  const patchLeg = (i: number, patch: Partial<LegState>) =>
    setLegs((prev) => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  const addLeg = () => {
    const prev = legs[legs.length - 1];
    const next = makeLeg();
    next.departure = prev.arrival;
    setLegs((l) => [...l, next]);
  };

  const handleAircraftChange = (type: string, flags: AircraftFlags) => {
    setAircraftType(type);
    setMultiEngine(flags.multiEngine);
    setTurbine(flags.turbine);
  };

  const dutyTotal = useMemo(() => legs.reduce((s, l) => s + legTotalTime(l), 0), [legs]);
  const dutyLandings = useMemo(() => legs.reduce((s, l) => s + l.landingsDay + l.landingsNight, 0), [legs]);
  const warnings = useMemo(() => buildWarnings(legs), [legs]);

  const buildPayload = (leg: LegState) => ({
    date:           flightDate.toISOString(),
    aircraftType,
    registration:   registration || null,
    departure:      leg.departure || null,
    arrival:        leg.arrival || null,
    totalTime:      parseFloat(legTotalTime(leg).toFixed(2)),
    picTime:        leg.picTime,
    sicTime:        leg.sicTime,
    multiEngineTime: multiEngine ? leg.multiEngineTime : 0,
    turbineTime:    turbine ? leg.turbineTime : 0,
    instrumentTime: leg.instrumentTime,
    nightTime:      leg.nightTime,
    landingsDay:    leg.landingsDay,
    landingsNight:  leg.landingsNight,
    remarks:        remarks || null,
  });

  const handleSave = async () => {
    if (!aircraftType) return Alert.alert('Missing info', 'Aircraft type is required.');
    if (legs.some((l) => legTotalTime(l) <= 0))
      return Alert.alert('Missing info', 'Set block times or enter total time for each leg.');

    const doSave = async () => {
      setSaving(true);
      try {
        if (isEdit && params?.logId) {
          const { data } = await flightLogApi.update(params.logId, buildPayload(legs[0]));
          dispatch(updateLogAction(data));
        } else if (legs.length === 1) {
          const payload = buildPayload(legs[0]);
          try {
            const { data } = await flightLogApi.create(payload);
            dispatch(addLog(data));
          } catch {
            await enqueue(payload);
            Alert.alert('Saved offline', 'No connection — flight queued and will sync automatically.');
            navigation.goBack();
            return;
          }
        } else {
          const payloads = legs.map(buildPayload);
          try {
            const { data } = await flightLogApi.bulk(payloads);
            dispatch(addLogs(data.logs));
          } catch {
            for (const p of payloads) await enqueue(p);
            Alert.alert('Saved offline', `${payloads.length} legs queued.`);
            navigation.goBack();
            return;
          }
        }
        navigation.goBack();
      } catch (err: any) {
        Alert.alert('Error', err?.response?.data?.error ?? 'Could not save. Try again.');
      } finally {
        setSaving(false);
      }
    };

    if (warnings.length > 0) {
      Alert.alert(
        'Check your entry',
        warnings.join('\n\n'),
        [
          { text: 'Review', style: 'cancel' },
          { text: 'Save anyway', onPress: doSave },
        ],
      );
    } else {
      await doSave();
    }
  };

  const multiLeg = legs.length > 1;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">

        {/* Date */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Date</Text>
          <DatePickerInput value={flightDate} onChange={setFlightDate} maximumDate={new Date()} />
        </View>

        {/* Aircraft */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Aircraft</Text>
          <AircraftPicker
            aircraftType={aircraftType} registration={registration}
            onTypeChange={handleAircraftChange} onRegChange={setRegistration}
            typeRatings={typeRatings} recentTypes={recent.types} recentRegs={recent.regByType}
          />
          <View style={s.flagRow}>
            {[
              { label: 'Multi-Engine', val: multiEngine, set: setMultiEngine },
              { label: 'Turbine',      val: turbine,     set: setTurbine },
            ].map(({ label, val, set }) => (
              <View key={label} style={s.flagItem}>
                <Text style={s.flagLabel}>{label}</Text>
                <Switch value={val} onValueChange={set} trackColor={{ false: '#243050', true: '#00B4D8' }} thumbColor="#fff" />
              </View>
            ))}
          </View>
        </View>

        {/* Duty day banner */}
        {multiLeg && (
          <View style={s.dutyBanner}>
            <Text style={s.dutyText}>
              Duty day: {legs.length} legs · {fmtHours(dutyTotal)} · {dutyLandings} landings
            </Text>
          </View>
        )}

        {/* Leg cards */}
        {legs.map((leg, i) => (
          <LegCard
            key={leg.key} leg={leg} index={i}
            flightDate={flightDate} multiLeg={multiLeg} recentIcaos={recentIcaos}
            onChange={(patch) => patchLeg(i, patch)}
            onRemove={multiLeg && i > 0 ? () => setLegs((l) => l.filter((_, idx) => idx !== i)) : undefined}
          />
        ))}

        {/* Add another leg */}
        {!isEdit && (
          <TouchableOpacity style={s.addLegBtn} onPress={addLeg}>
            <Ionicons name="add-circle-outline" size={18} color="#00B4D8" />
            <Text style={s.addLegText}>Add another leg</Text>
          </TouchableOpacity>
        )}

        {/* Remarks */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Remarks</Text>
          <TextInput
            style={[s.hoursInput, { height: 80, textAlignVertical: 'top', marginTop: 0 }]}
            value={remarks} onChangeText={setRemarks}
            placeholder="Notes about this flight (optional)"
            placeholderTextColor="#4A6080"
            multiline autoCapitalize="sentences"
          />
        </View>

        {warnings.length > 0 && (
          <View style={{ marginHorizontal: 16, marginTop: 4 }}>
            <WarningList warnings={warnings} />
          </View>
        )}

        {/* Save */}
        <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" />
            : <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={s.saveBtnText}>
                  {isEdit ? 'Update Flight' : multiLeg ? `Save ${legs.length} Legs` : 'Save Flight'}
                </Text>
              </>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#0A1628' },
  section:        { backgroundColor: '#1B2B4B', margin: 16, marginBottom: 0, borderRadius: 14, padding: 16 },
  sectionTitle:   { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 12 },
  sectionLabel:   { color: '#C0CDE0', fontSize: 12, fontWeight: '600', marginBottom: 8 },
  sectionSubLabel: { color: '#4A6080', fontSize: 11, marginBottom: 6 },

  flagRow:  { flexDirection: 'row', gap: 16, marginTop: 12 },
  flagItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flagLabel: { color: '#C0CDE0', fontSize: 13 },

  dutyBanner: {
    backgroundColor: '#0A2F50', margin: 16, marginBottom: 0,
    borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#00B4D8',
  },
  dutyText: { color: '#00B4D8', fontWeight: '700', fontSize: 14, textAlign: 'center' },

  legCard:      { backgroundColor: '#1B2B4B', margin: 16, marginBottom: 0, borderRadius: 14, padding: 16 },
  legCardMulti: { borderWidth: 1, borderColor: '#243050' },
  legHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  legHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legTitle:     { color: '#fff', fontWeight: '700', fontSize: 14, flex: 1 },

  routeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },

  computedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0A2040', borderRadius: 8, padding: 10, marginTop: 10,
  },
  computedText: { color: '#00B4D8', fontWeight: '700', fontSize: 14 },

  hoursGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  hoursField: { width: '47%' },
  hoursLabel: { color: '#C0CDE0', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  hoursInput: {
    backgroundColor: '#0A1628', borderRadius: 8, padding: 10,
    color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#243050', marginBottom: 0,
  },
  quickRow:   { flexDirection: 'row', gap: 4, marginTop: 5 },
  qChip:      { backgroundColor: '#0F2040', borderRadius: 12, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#243050' },
  qChipText:  { color: '#00B4D8', fontSize: 10, fontWeight: '700' },

  nightRow:   { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 10 },
  autoBtn:    {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#0A2040', borderRadius: 8, padding: 8,
    borderWidth: 1, borderColor: '#00B4D8', marginBottom: 2,
  },
  autoBtnText: { color: '#00B4D8', fontSize: 11, fontWeight: '600' },

  landingsRow: { flexDirection: 'row', gap: 20, paddingVertical: 8 },

  addLegBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 16, marginBottom: 0, padding: 14,
    backgroundColor: '#0F2040', borderRadius: 12,
    borderWidth: 1, borderColor: '#00B4D8', borderStyle: 'dashed',
    justifyContent: 'center',
  },
  addLegText: { color: '#00B4D8', fontWeight: '700', fontSize: 14 },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#00B4D8', borderRadius: 12, padding: 16, margin: 16,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
