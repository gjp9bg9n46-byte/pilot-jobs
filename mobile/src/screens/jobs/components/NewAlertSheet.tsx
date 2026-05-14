// TODO: extract FilterSheet from JobsScreen to shared component at mobile/src/components/FilterSheet.tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FilterState } from '../../../types/job';
import { DEFAULT_FILTERS, COMMON_AUTHORITIES, REGIONS, ROLES, CONTRACT_TYPES, POSTED_WITHIN } from '../../../types/job';
import type { AlertFrequency, SavedSearch } from '../../../types/alert';
import { FREQUENCY_LABELS } from '../../../types/alert';

interface Props {
  visible: boolean;
  existing?: SavedSearch | null;
  onClose: () => void;
  onSave: (data: { name: string; filters: FilterState; frequency: AlertFrequency }) => void;
}

function generateName(f: FilterState): string {
  const parts: string[] = [];
  if (f.role) parts.push(f.role);
  if (f.authorities.length) parts.push(f.authorities.slice(0, 2).join('/'));
  if (f.region) parts.push(f.region);
  if (f.aircraft) parts.push(f.aircraft);
  if (f.contractType) parts.push(f.contractType);
  return parts.length ? parts.join(' · ') : 'My Alert';
}

const FREQUENCIES: AlertFrequency[] = ['INSTANT', 'DAILY', 'WEEKLY'];

export default function NewAlertSheet({ visible, existing, onClose, onSave }: Props) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<AlertFrequency>('INSTANT');
  const [nameTouched, setNameTouched] = useState(false);

  useEffect(() => {
    if (visible) {
      if (existing) {
        setFilters(existing.filters as FilterState);
        setName(existing.name);
        setFrequency(existing.frequency);
        setNameTouched(true);
      } else {
        setFilters(DEFAULT_FILTERS);
        setName('');
        setFrequency('INSTANT');
        setNameTouched(false);
      }
    }
  }, [visible, existing]);

  useEffect(() => {
    if (!nameTouched) setName(generateName(filters));
  }, [filters, nameTouched]);

  function toggle<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function toggleAuthority(auth: string) {
    setFilters((prev) => {
      const has = prev.authorities.includes(auth);
      return { ...prev, authorities: has ? prev.authorities.filter((a) => a !== auth) : [...prev.authorities, auth] };
    });
  }

  function handleSave() {
    const finalName = name.trim() || generateName(filters);
    onSave({ name: finalName, filters, frequency });
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.root}>
        <View style={s.handle} />
        <View style={s.headerRow}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#7A8CA0" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{existing ? 'Edit Alert' : 'New Alert'}</Text>
          <TouchableOpacity onPress={handleSave} style={s.saveBtn}>
            <Text style={s.saveBtnText}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

          {/* Name */}
          <Text style={s.label}>Alert name</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={(t) => { setName(t); setNameTouched(true); }}
            placeholder="e.g. First Officer Europe"
            placeholderTextColor="#4A5E78"
            onFocus={() => setNameTouched(true)}
          />

          {/* Frequency */}
          <Text style={s.label}>Notification frequency</Text>
          <View style={s.chips}>
            {FREQUENCIES.map((f) => (
              <TouchableOpacity
                key={f}
                style={[s.chip, frequency === f && s.chipActive]}
                onPress={() => setFrequency(f)}
              >
                <Text style={[s.chipText, frequency === f && s.chipTextActive]}>
                  {FREQUENCY_LABELS[f]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Authorities */}
          <Text style={s.label}>Authority</Text>
          <View style={s.chips}>
            {COMMON_AUTHORITIES.map((a) => (
              <TouchableOpacity
                key={a}
                style={[s.chip, filters.authorities.includes(a) && s.chipActive]}
                onPress={() => toggleAuthority(a)}
              >
                <Text style={[s.chipText, filters.authorities.includes(a) && s.chipTextActive]}>{a}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Role */}
          <Text style={s.label}>Role</Text>
          <View style={s.chips}>
            {ROLES.map((r) => (
              <TouchableOpacity
                key={r}
                style={[s.chip, filters.role === r && s.chipActive]}
                onPress={() => toggle('role', filters.role === r ? '' : r)}
              >
                <Text style={[s.chipText, filters.role === r && s.chipTextActive]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Region */}
          <Text style={s.label}>Region</Text>
          <View style={s.chips}>
            {REGIONS.map((r) => (
              <TouchableOpacity
                key={r}
                style={[s.chip, filters.region === r && s.chipActive]}
                onPress={() => toggle('region', filters.region === r ? '' : r)}
              >
                <Text style={[s.chipText, filters.region === r && s.chipTextActive]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Contract type */}
          <Text style={s.label}>Contract type</Text>
          <View style={s.chips}>
            {CONTRACT_TYPES.map(({ value, label }) => (
              <TouchableOpacity
                key={value}
                style={[s.chip, filters.contractType === value && s.chipActive]}
                onPress={() => toggle('contractType', filters.contractType === value ? '' : value)}
              >
                <Text style={[s.chipText, filters.contractType === value && s.chipTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Aircraft */}
          <Text style={s.label}>Aircraft type</Text>
          <TextInput
            style={s.input}
            value={filters.aircraft}
            onChangeText={(t) => toggle('aircraft', t)}
            placeholder="e.g. B737, A320"
            placeholderTextColor="#4A5E78"
          />

          {/* Salary */}
          <Text style={s.label}>Min salary (USD/year)</Text>
          <TextInput
            style={s.input}
            value={filters.salaryMin}
            onChangeText={(t) => toggle('salaryMin', t)}
            placeholder="e.g. 80000"
            placeholderTextColor="#4A5E78"
            keyboardType="numeric"
          />

          {/* Posted within */}
          <Text style={s.label}>Posted within</Text>
          <View style={s.chips}>
            {POSTED_WITHIN.map(({ value, label }) => (
              <TouchableOpacity
                key={value}
                style={[s.chip, filters.postedWithin === value && s.chipActive]}
                onPress={() => toggle('postedWithin', value)}
              >
                <Text style={[s.chipText, filters.postedWithin === value && s.chipTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A1628' },
  handle: { width: 36, height: 4, backgroundColor: '#243050', borderRadius: 2, alignSelf: 'center', marginTop: 8 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1B2B4B',
  },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#E8F0F8' },
  saveBtn: { backgroundColor: '#00B4D8', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  scroll: { flex: 1 },
  content: { padding: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#7A8CA0', marginTop: 18, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#243050', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { backgroundColor: '#00B4D822', borderColor: '#00B4D8' },
  chipText: { fontSize: 13, color: '#7A8CA0' },
  chipTextActive: { color: '#00B4D8', fontWeight: '600' },
  input: {
    backgroundColor: '#1B2B4B', borderWidth: 1, borderColor: '#243050',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    color: '#E8F0F8', fontSize: 14,
  },
});
