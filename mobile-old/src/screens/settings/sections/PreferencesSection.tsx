import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { profileApi } from '../../../services/api';
import { useAutoSave } from '../../../hooks/useAutoSave';
import type { JobPrefs } from '../../../types/preferences';
import { SALARY_CURRENCIES, CONTRACT_TYPE_LABELS, ROUTE_TYPE_LABELS } from '../../../types/settings';
import type { SalaryCurrency, SalaryPeriod, ContractType, RouteType } from '../../../types/settings';
import { SectionCard, Toast, SavedLine, MultiPickerModal } from './shared';
import countriesData from '../../../data/countries.json';

const COUNTRIES: { value: string; label: string }[] = (countriesData as { code: string; name: string }[])
  .map((c) => ({ value: c.code, label: c.name }))
  .sort((a, b) => a.label.localeCompare(b.label));

// Common ICAO aircraft types with friendly names
const AIRCRAFT_TYPES: { value: string; label: string }[] = [
  { value: 'B737', label: 'B737 — Boeing 737 Classic' },
  { value: 'B738', label: 'B738 — Boeing 737-800' },
  { value: 'B739', label: 'B739 — Boeing 737-900' },
  { value: 'B38M', label: 'B38M — Boeing 737 MAX 8' },
  { value: 'B744', label: 'B744 — Boeing 747-400' },
  { value: 'B748', label: 'B748 — Boeing 747-8' },
  { value: 'B752', label: 'B752 — Boeing 757-200' },
  { value: 'B762', label: 'B762 — Boeing 767-200' },
  { value: 'B763', label: 'B763 — Boeing 767-300' },
  { value: 'B772', label: 'B772 — Boeing 777-200' },
  { value: 'B77L', label: 'B77L — Boeing 777-200LR' },
  { value: 'B773', label: 'B773 — Boeing 777-300' },
  { value: 'B77W', label: 'B77W — Boeing 777-300ER' },
  { value: 'B788', label: 'B788 — Boeing 787-8' },
  { value: 'B789', label: 'B789 — Boeing 787-9' },
  { value: 'A318', label: 'A318 — Airbus A318' },
  { value: 'A319', label: 'A319 — Airbus A319' },
  { value: 'A320', label: 'A320 — Airbus A320' },
  { value: 'A321', label: 'A321 — Airbus A321' },
  { value: 'A20N', label: 'A20N — Airbus A320neo' },
  { value: 'A21N', label: 'A21N — Airbus A321neo' },
  { value: 'A332', label: 'A332 — Airbus A330-200' },
  { value: 'A333', label: 'A333 — Airbus A330-300' },
  { value: 'A339', label: 'A339 — Airbus A330-900neo' },
  { value: 'A342', label: 'A342 — Airbus A340-200' },
  { value: 'A345', label: 'A345 — Airbus A340-500' },
  { value: 'A346', label: 'A346 — Airbus A340-600' },
  { value: 'A359', label: 'A359 — Airbus A350-900' },
  { value: 'A35K', label: 'A35K — Airbus A350-1000' },
  { value: 'A388', label: 'A388 — Airbus A380-800' },
  { value: 'E170', label: 'E170 — Embraer 170' },
  { value: 'E175', label: 'E175 — Embraer 175' },
  { value: 'E190', label: 'E190 — Embraer 190' },
  { value: 'E195', label: 'E195 — Embraer 195' },
  { value: 'E290', label: 'E290 — Embraer E190-E2' },
  { value: 'E295', label: 'E295 — Embraer E195-E2' },
  { value: 'CRJ7', label: 'CRJ7 — Bombardier CRJ-700' },
  { value: 'CRJ9', label: 'CRJ9 — Bombardier CRJ-900' },
  { value: 'CRJX', label: 'CRJX — Bombardier CRJ-1000' },
  { value: 'DH8D', label: 'DH8D — Dash 8 Q400' },
  { value: 'AT72', label: 'AT72 — ATR 72' },
  { value: 'AT75', label: 'AT75 — ATR 72-500' },
  { value: 'AT76', label: 'AT76 — ATR 72-600' },
  { value: 'AT42', label: 'AT42 — ATR 42' },
  { value: 'C208', label: 'C208 — Cessna Caravan' },
  { value: 'PC12', label: 'PC12 — Pilatus PC-12' },
  { value: 'TBM9', label: 'TBM9 — TBM 960' },
  { value: 'C172', label: 'C172 — Cessna 172' },
  { value: 'PA28', label: 'PA28 — Piper Cherokee' },
  { value: 'C152', label: 'C152 — Cessna 152' },
  { value: 'P28A', label: 'P28A — Piper Archer' },
];

interface Props {
  prefs: JobPrefs;
  typeRatings: string[]; // from pilot profile
  onChange: (p: JobPrefs) => void;
}

export default function PreferencesSection({ prefs, typeRatings, onChange }: Props) {
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [countryModal, setCountryModal] = useState(false);
  const [aircraftModal, setAircraftModal] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2500);
  };

  const persist = useAutoSave<JobPrefs>(async (p) => {
    try {
      await profileApi.updatePreferences({
        preferredCountries: p.preferredCountries,
        preferredAircraft:  p.preferredAircraft,
        minSalary: p.salaryNegotiable ? null : (p.minSalary || null),
        // TODO: backend — add minSalaryCurrency, minSalaryPeriod, preferredContractTypes, routePreferences, salaryNegotiable
      });
      setSavedAt(new Date());
    } catch {
      showToast('Could not save preferences');
    }
  }, 600);

  const update = (patch: Partial<JobPrefs>) => {
    const next = { ...prefs, ...patch };
    onChange(next);
    persist(next);
  };

  const toggleChip = <T extends string>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  const ratedTypes = typeRatings.map((t) => ({ value: t, label: t }));

  return (
    <SectionCard title="Job Preferences" icon="briefcase-outline">
      {toast ? <Toast message={toast} /> : null}

      {/* Countries */}
      <Text style={s.label}>Preferred countries</Text>
      <TouchableOpacity style={s.pickerBtn} onPress={() => setCountryModal(true)}>
        <Text style={prefs.preferredCountries.length ? s.pickerValue : s.pickerPlaceholder}>
          {prefs.preferredCountries.length
            ? prefs.preferredCountries.join(', ')
            : 'Tap to select countries'}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#7A8CA0" />
      </TouchableOpacity>

      <MultiPickerModal
        visible={countryModal}
        title="Preferred countries"
        items={COUNTRIES}
        selected={prefs.preferredCountries}
        onClose={() => setCountryModal(false)}
        onConfirm={(sel) => update({ preferredCountries: sel })}
      />

      {/* Aircraft */}
      <Text style={[s.label, { marginTop: 14 }]}>Preferred aircraft types</Text>
      <TouchableOpacity style={s.pickerBtn} onPress={() => setAircraftModal(true)}>
        <Text style={prefs.preferredAircraft.length ? s.pickerValue : s.pickerPlaceholder} numberOfLines={2}>
          {prefs.preferredAircraft.length
            ? prefs.preferredAircraft.join(', ')
            : 'Tap to select aircraft types'}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#7A8CA0" />
      </TouchableOpacity>

      <MultiPickerModal
        visible={aircraftModal}
        title="Preferred aircraft types"
        items={AIRCRAFT_TYPES}
        selected={prefs.preferredAircraft}
        pinnedSection={ratedTypes.length > 0 ? { title: 'YOUR RATED TYPES', items: ratedTypes } : undefined}
        onClose={() => setAircraftModal(false)}
        onConfirm={(sel) => update({ preferredAircraft: sel })}
      />

      {/* Contract types — TODO: backend field */}
      <Text style={[s.label, { marginTop: 14 }]}>Preferred contract types</Text>
      <View style={s.chipGrid}>
        {(Object.keys(CONTRACT_TYPE_LABELS) as ContractType[]).map((ct) => {
          const on = prefs.preferredContractTypes.includes(ct);
          return (
            <TouchableOpacity
              key={ct}
              style={[s.chip, on && s.chipActive]}
              onPress={() => update({ preferredContractTypes: toggleChip(prefs.preferredContractTypes, ct) })}
            >
              <Text style={[s.chipText, on && s.chipTextActive]}>{CONTRACT_TYPE_LABELS[ct]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={s.todoNote}>TODO: backend — preferredContractTypes field</Text>

      {/* Route preference — TODO: backend field */}
      <Text style={[s.label, { marginTop: 14 }]}>Route preference</Text>
      <View style={s.chipGrid}>
        {(Object.keys(ROUTE_TYPE_LABELS) as RouteType[]).map((rt) => {
          const on = prefs.routePreferences.includes(rt);
          return (
            <TouchableOpacity
              key={rt}
              style={[s.chip, on && s.chipActive]}
              onPress={() => update({ routePreferences: toggleChip(prefs.routePreferences, rt) })}
            >
              <Text style={[s.chipText, on && s.chipTextActive]}>{ROUTE_TYPE_LABELS[rt]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={s.todoNote}>TODO: backend — routePreferences field</Text>

      {/* Salary */}
      <Text style={[s.label, { marginTop: 14 }]}>Minimum salary</Text>
      <View style={s.salaryRow}>
        <Switch
          value={prefs.salaryNegotiable}
          onValueChange={(v) => update({ salaryNegotiable: v })}
          trackColor={{ false: '#243050', true: '#00B4D8' }}
          thumbColor="#fff"
        />
        <Text style={s.salaryNegLabel}>Negotiable / open to any</Text>
      </View>

      {!prefs.salaryNegotiable && (
        <>
          <View style={s.salaryInputRow}>
            {/* Currency picker */}
            <View style={s.currencyWrap}>
              {SALARY_CURRENCIES.map((c) => (
                <TouchableOpacity
                  key={c.code}
                  style={[s.currencyChip, prefs.minSalaryCurrency === c.code && s.currencyChipActive]}
                  onPress={() => update({ minSalaryCurrency: c.code })}
                >
                  <Text style={[s.currencyText, prefs.minSalaryCurrency === c.code && s.currencyTextActive]}>
                    {c.code}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TextInput
            style={s.input}
            value={prefs.minSalary != null ? String(prefs.minSalary) : ''}
            onChangeText={(v) => update({ minSalary: v ? Number(v.replace(/[^0-9]/g, '')) : null })}
            placeholder={`Amount in ${prefs.minSalaryCurrency}`}
            placeholderTextColor="#4A6080"
            keyboardType="numeric"
          />

          <View style={s.periodRow}>
            {(['year', 'month'] as SalaryPeriod[]).map((p) => (
              <TouchableOpacity
                key={p}
                style={[s.periodBtn, prefs.minSalaryPeriod === p && s.periodBtnActive]}
                onPress={() => update({ minSalaryPeriod: p })}
              >
                <Text style={[s.periodText, prefs.minSalaryPeriod === p && s.periodTextActive]}>
                  Per {p}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.todoNote}>TODO: backend — minSalaryCurrency, minSalaryPeriod, salaryNegotiable fields</Text>
        </>
      )}

      <SavedLine savedAt={savedAt} />
    </SectionCard>
  );
}

const s = StyleSheet.create({
  label:          { color: '#C0CDE0', fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 4 },
  pickerBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0A1628', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#243050', marginBottom: 4 },
  pickerValue:    { color: '#fff', fontSize: 13, flex: 1, marginRight: 8 },
  pickerPlaceholder: { color: '#4A6080', fontSize: 13, flex: 1, marginRight: 8 },
  chipGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip:           { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#0F2040', borderWidth: 1, borderColor: '#243050' },
  chipActive:     { backgroundColor: '#0A2F50', borderColor: '#00B4D8' },
  chipText:       { color: '#7A8CA0', fontSize: 13 },
  chipTextActive: { color: '#00B4D8', fontWeight: '600' },
  todoNote:       { color: '#4A6080', fontSize: 11, fontStyle: 'italic', marginTop: 2, marginBottom: 6 },
  salaryRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  salaryNegLabel: { color: '#C0CDE0', fontSize: 14 },
  salaryInputRow: { marginBottom: 8 },
  currencyWrap:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  currencyChip:   { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: '#0F2040', borderWidth: 1, borderColor: '#243050' },
  currencyChipActive: { borderColor: '#00B4D8', backgroundColor: '#0A2F50' },
  currencyText:   { color: '#7A8CA0', fontSize: 12, fontWeight: '600' },
  currencyTextActive: { color: '#00B4D8' },
  input:          { backgroundColor: '#0A1628', borderRadius: 8, padding: 12, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#243050', marginBottom: 8 },
  periodRow:      { flexDirection: 'row', gap: 8, marginBottom: 4 },
  periodBtn:      { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#243050', alignItems: 'center', backgroundColor: '#0F2040' },
  periodBtnActive:{ borderColor: '#00B4D8', backgroundColor: '#0A2F50' },
  periodText:     { color: '#7A8CA0', fontSize: 13, fontWeight: '600' },
  periodTextActive: { color: '#00B4D8' },
});
